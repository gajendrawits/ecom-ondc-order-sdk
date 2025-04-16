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

function isETABreached(data) {
  if (!data || typeof data !== "object") {
    return true;
  }

  if (!data.createdAt || !data.createdAt.$date) {
    return true;
  }

  if (!Array.isArray(data.fulfillments) || data.fulfillments.length === 0) {
    return true;
  }

  const currentTime = new Date();
  const createdAt = new Date(data.createdAt.$date);

  const deliveryFulfillment = data.fulfillments.find(
    (fulfillment) => fulfillment?.type === "Delivery"
  );

  if (!deliveryFulfillment) {
    return true;
  }

  if (!deliveryFulfillment["@ondc/org/TAT"]) {
    return true;
  }

  const deliveryTime = isoDurationToMilliseconds(
    deliveryFulfillment["@ondc/org/TAT"]
  );
  const deliveryETA = new Date(createdAt.getTime() + deliveryTime);

  if (!deliveryFulfillment.state?.descriptor?.code) {
    return true;
  }

  if (deliveryFulfillment.state.descriptor.code === "Pending") {
    // Pre-Ship ETA Breach
    return currentTime >= deliveryETA;
  } else {
    // Post-Ship ETA breach
    const ETA = deliveryETA - createdAt;
    const halfETA = Math.max(ETA / 2, 0); // Ensure non-negative

    let buffer;
    if (data.domain === "ONDC:RET10") {
      buffer = Math.min(0.5 * 60 * 60 * 1000, halfETA);
    } else {
      buffer = Math.min(2 * 24 * 60 * 60 * 1000, halfETA);
    }

    return currentTime >= new Date(deliveryETA.getTime() + buffer);
  }
}
export { isETABreached };
