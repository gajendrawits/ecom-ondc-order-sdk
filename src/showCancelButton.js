function isoDurationToMilliseconds(iso) {
    const regex = /P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?/;
    const match = iso.match(regex);

    if (!match) return 0;

    const days = parseInt(match[1] || "0", 10);
    const hours = parseInt(match[2] || "0", 10);
    const minutes = parseInt(match[3] || "0", 10);
    const seconds = parseInt(match[4] || "0", 10);

    return (((days * 24 + hours) * 60 + minutes) * 60 + seconds) * 1000;
}

const SCB_FH = 0;
const SCB_FNH = 0;
const SCB_GH = 0;
const SCB_GNH = 0;
const SCB_BH = 0;
const SCB_BNH = 0;
const SCB_EH = 0;
const SCB_ENH = 0;
const SCB_XXH = 0;
const SCB_XXNH = 0;

const HL_CAP = 180;

export const shouldShowCancelButton = (actor, payload) => {
    if (!payload) return false;

    const domain = payload?.domain;
    const items = payload?.confirmedItems;
    const orderCreatedTimestamp = new Date(payload?.createdAt).getTime();
    const currentTimestamp = Date.now();

    const deliveryFulfillment = (payload.fulfillments || []).find(
        (fulfillment) => fulfillment?.type === "Delivery"
    );

    if (!deliveryFulfillment || !deliveryFulfillment["@ondc/org/TAT"]) {
        return false;
    }

    const fulfillmentTAT = isoDurationToMilliseconds(
        deliveryFulfillment["@ondc/org/TAT"]
    ) / (60 * 1000);

    let promiseBuffer;
    switch (domain) {
        case "ONDC:RET11":
            promiseBuffer = 0;
            break;
        case "ONDC:RET12":
            promiseBuffer = 0;
            break;
        case "ONDC:RET13":
            promiseBuffer = 0;
            break;
        case "ONDC:RET14":
            promiseBuffer = 0;
            break;
        default:
            promiseBuffer = 0;
    }

    const deliveryPromiseETA = fulfillmentTAT + promiseBuffer;

    const hyperlocalFlag = deliveryPromiseETA <= HL_CAP;

    const deliveryPromiseETABreach = currentTimestamp >
        (orderCreatedTimestamp + (fulfillmentTAT * 60 * 1000));

    let SCB;
    switch (domain) {
        case 'ONDC:RET12':
            SCB = hyperlocalFlag ? SCB_FH * 60 * 60 * 1000 : SCB_FNH * 60 * 60 * 1000;
            break;
        case 'ONDC:RET11':
            SCB = hyperlocalFlag ? SCB_GH * 60 * 60 * 1000 : SCB_GNH * 60 * 60 * 1000;
            break;
        case 'ONDC:RET13':
            SCB = hyperlocalFlag ? SCB_BH * 60 * 60 * 1000 : SCB_BNH * 60 * 60 * 1000;
            break;
        case 'ONDC:RET14':
            SCB = hyperlocalFlag ? SCB_EH * 60 * 60 * 1000 : SCB_ENH * 60 * 60 * 1000;
            break;
        case 'ONDC:RET15':
            SCB = hyperlocalFlag ? SCB_FH * 60 * 60 * 1000 : SCB_FNH * 60 * 60 * 1000;
            break;
        default:
            SCB = hyperlocalFlag ? SCB_XXH * 60 * 60 * 1000 : SCB_XXNH * 60 * 60 * 1000;
    }

    const allItemsCancellable = items.every(item => {
        const productCancellable = item?.product?.["@ondc/org/cancellable"] !== false;
        const itemCancellable = item?.["@ondc/org/cancellable"] !== false;
        return productCancellable && itemCancellable;
    });

    if (actor === 'buyer') {
        if (domain === 'ONDC:RET12') {
            return allItemsCancellable &&
                currentTimestamp >= orderCreatedTimestamp + SCB;
        } else if (hyperlocalFlag) {
            return allItemsCancellable &&
                currentTimestamp >= orderCreatedTimestamp + SCB;
        } else {
            if (allItemsCancellable) {
                return currentTimestamp >= orderCreatedTimestamp + SCB;
            } else if (deliveryPromiseETABreach) {
                return currentTimestamp >= orderCreatedTimestamp +
                    (fulfillmentTAT * 60 * 1000) +
                    SCB;
            }
            return false;
        }
    } else if (actor === 'agent' || actor === 'opsLead') {
        if (domain === 'ONDC:RET12') {
            if (allItemsCancellable) {
                return currentTimestamp >= orderCreatedTimestamp + SCB;
            } else if (deliveryPromiseETABreach) {
                return currentTimestamp >= orderCreatedTimestamp +
                    (fulfillmentTAT * 60 * 1000) +
                    SCB;
            }
            return false;
        } else {
            if (allItemsCancellable) {
                return currentTimestamp >= orderCreatedTimestamp + SCB;
            } else if (deliveryPromiseETABreach) {
                return currentTimestamp >= orderCreatedTimestamp +
                    (fulfillmentTAT * 60 * 1000) +
                    SCB;
            }
            return false;
        }
    }

    return false;
};
