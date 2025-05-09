export const calculateRefundAmount = async (
  protocolCancelResponse,
  transaction,
  refundedFl,
  charge
) => {
  if (!protocolCancelResponse || typeof protocolCancelResponse !== "object") {
    throw new Error("Invalid protocolCancelResponse: must be an object");
  }

  if (!transaction || typeof transaction !== "object") {
    throw new Error("Invalid transaction: must be an object");
  }

  if (!refundedFl || !Array.isArray(refundedFl)) {
    throw new Error("Invalid refundedFl: must be an array");
  }

  if (!charge || typeof charge !== "object") {
    throw new Error("Invalid charge: must be an object");
  }

  if (
    typeof transaction.amount === "undefined" ||
    isNaN(parseFloat(transaction.amount))
  ) {
    throw new Error("Invalid transaction amount: must be a number");
  }

  const transactionAmount = parseFloat(
    parseFloat(transaction.amount).toFixed(2)
  );
  if (transactionAmount <= 0) {
    throw new Error("Transaction amount must be positive");
  }

  let refundPlatformFees = false;
  let cancelCoupon = false;
  let totalRefundedAmount = 0;
  let currentRefundAmount = 0;

  try {
    const refundedIds = refundedFl.map((fulfillment) => {
      if (!fulfillment || typeof fulfillment !== "object") {
        throw new Error("Invalid fulfillment in refundedFl");
      }
      return fulfillment.flId;
    });

    if (
      !protocolCancelResponse.message ||
      !protocolCancelResponse.message.order ||
      !Array.isArray(protocolCancelResponse.message.order.fulfillments)
    ) {
      throw new Error(
        "Invalid protocolCancelResponse structure: missing required fields"
      );
    }

    const yetToRefund = protocolCancelResponse.message.order.fulfillments
      .filter((fulfillment) => {
        if (!fulfillment || typeof fulfillment !== "object") {
          throw new Error("Invalid fulfillment in order");
        }
        return fulfillment.type !== "Delivery";
      })
      .map((fulfillment) => {
        if (!fulfillment.id) {
          throw new Error("Fulfillment missing ID");
        }
        return fulfillment.id;
      });

    const pendingRefundIds = yetToRefund.filter(
      (id) => !refundedIds.includes(id)
    );

    const refundedAmountArray = refundedFl.map((fulfillment) => {
      if (isNaN(parseFloat(fulfillment.amount))) {
        throw new Error("Invalid amount in refunded fulfillment");
      }
      return parseFloat(fulfillment.amount);
    });

    const refundedAmount = refundedAmountArray.reduce(
      (sum, amount) => sum + amount,
      0
    );

    if (refundedAmount > transactionAmount) {
      throw new Error("Refunded amount cannot exceed transaction amount");
    }

    totalRefundedAmount = refundedAmount;

    for (let pnId of pendingRefundIds) {
      let refundAmount = 0;

      const fulfillment =
        protocolCancelResponse.message.order.fulfillments.find(
          (f) => f.id === pnId
        );

      if (!fulfillment) {
        continue;
      }

      if (!fulfillment.tags || !Array.isArray(fulfillment.tags)) {
        throw new Error(`Fulfillment ${pnId} has invalid tags`);
      }

      const quoteTrails = fulfillment.tags.filter(
        (tag) => tag.code === "quote_trail"
      );

      for (let trail of quoteTrails) {
        if (!trail.list || !Array.isArray(trail.list)) {
          throw new Error(`Invalid trail list in fulfillment ${pnId}`);
        }

        const amountItem = trail.list.find((item) => item.code === "value");
        const amount = amountItem?.value ?? 0;

        if (isNaN(parseFloat(amount))) {
          throw new Error(`Invalid amount value in fulfillment ${pnId}`);
        }

        refundAmount += parseFloat(amount) * -1;
      }

      if (isNaN(refundAmount) || refundAmount < 0) {
        throw new Error(
          `Invalid calculated refund amount for fulfillment ${pnId}`
        );
      }

      let remainingRefund = transactionAmount - totalRefundedAmount;

      if (transactionAmount > totalRefundedAmount) {
        if (remainingRefund < refundAmount) {
          refundAmount = remainingRefund;
        }
      } else {
        if (remainingRefund > refundAmount) {
          refundAmount = transactionAmount;
        } else {
          refundAmount = remainingRefund;
        }
      }

      totalRefundedAmount += refundAmount;
      currentRefundAmount = refundAmount;

      let difference = transactionAmount - totalRefundedAmount;
      difference = parseFloat(difference.toFixed(2));

      if (charge?.quote) {
        const platformFees = parseFloat(charge.quote.platformFees || 0);
        const platformFeesTax = parseFloat(
          charge.quote.taxes?.platformFeesTax || 0
        );

        if (difference <= platformFees + platformFeesTax) {
          refundPlatformFees = true;
          cancelCoupon = true;
        }

        if (difference === platformFees + platformFeesTax) {
          currentRefundAmount += platformFees + platformFeesTax;
          totalRefundedAmount += platformFees + platformFeesTax;
        }
      }

      currentRefundAmount = parseFloat(currentRefundAmount.toFixed(2));
      totalRefundedAmount = parseFloat(totalRefundedAmount.toFixed(2));
    }

    if (totalRefundedAmount > transactionAmount) {
      throw new Error("Total refunded amount cannot exceed transaction amount");
    }

    return {
      refundPlatformFees,
      cancelCoupon,
      totalRefundedAmount,
      refundAmount: currentRefundAmount,
    };
  } catch (error) {
    console.error("Error in calculateRefundAmount:", error);
    throw error;
  }
};

const refundPlatformFee = (actor, actionType, action, isETABreached) => {
  const isBuyer = actor.toLowerCase() === "buyer";
  const isSeller = actor.toLowerCase() === "seller";
  const isFull = actionType.toLowerCase() === "full";
  const isCancellation = action.toLowerCase() === "cancellation";
  const isReturn = action.toLowerCase() === "return";

  if (isBuyer && isFull && isCancellation && isETABreached) return true;

  if (isBuyer && isFull && isReturn) return true;

  if (isSeller && isFull && isCancellation) return true;

  if (isSeller && isFull && isReturn) return true;

  return false;
};

export const refund = (
  actor,
  actionType,
  action,
  isETABreached,
  charge,
  on_cancelPayload
) => {
  try {
    const paymentGatewayAmount = parseFloat(charge?.quote?.totalOrderValue)

    const platformFees = charge?.quote?.platformFees
    const platformFeesTax = charge?.quote?.taxes?.platformFeesTax

    const shouldRefundPlatformFeeWithTax = refundPlatformFee(actor, actionType, action, isETABreached)

    if (shouldRefundPlatformFeeWithTax) {
      return paymentGatewayAmount
    } else if (!shouldRefundPlatformFeeWithTax && actionType === "full") {
      return paymentGatewayAmount - platformFees - platformFeesTax
    } else {
      const cancelledItems = [];

      const items = on_cancelPayload?.message?.order?.items;
      items.forEach((item) => {
        if (item.fulfillment_id.includes("RTO")) {
          cancelledItems.push({
            itemId: item?.id,
            cancelledQuantity: item?.quantity?.count
          })
        }
      });

      let totalRefundAmount = 0

      cancelledItems.forEach((cancelledItem) => {
        let currentRefundAmount = 0

        let orderSellingPrice = 0
        charge?.quote?.itemsList.forEach((item) => {
          orderSellingPrice += item?.sellerPrice * item?.quantity
        })

        const FA_Discount = charge?.quote?.ONDC_FA
        const DigiHaatCoupon = charge?.quote?.totalOrderValueAfterSubsidyBeforeCoupon - charge?.quote?.totalOrderValue
        const mov = charge?.quote?.mov

        const cancelledItemAmount = charge?.quote?.itemsList?.find((item) => item.itemId === cancelledItem.itemId)?.sellerPrice * cancelledItem?.cancelledQuantity
        const totalOrderValueAfterRefund = Math.max(orderSellingPrice - cancelledItemAmount - totalRefundAmount, 0)

        if (totalOrderValueAfterRefund > mov) {
          currentRefundAmount = Math.max(cancelledItemAmount - FA_Discount - (DigiHaatCoupon * cancelledItemAmount / orderSellingPrice) - platformFees - platformFeesTax, 0)
        } else {
          currentRefundAmount = Math.max(cancelledItemAmount - FA_Discount - DigiHaatCoupon - platformFees - platformFeesTax, 0)
        }

        totalRefundAmount += currentRefundAmount
      })

      return parseFloat(parseFloat(totalRefundAmount).toFixed(2))
    }

  } catch (error) {
    console.error("Error calculating refund:", error);
    return {
      message: "Error processing refund calculation",
      error: error.message,
    };
  }
};