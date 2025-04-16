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
  const currentTime = new Date(Date.now());

  const createdAt = new Date(data.createdAt.$date);
  const deliveryTime = isoDurationToMilliseconds(
    data.fulfillments[0]["@ondc/org/TAT"]
  );
  const deliveryETA = new Date(createdAt.getTime() + deliveryTime);

  const deliveryFulfillment = data.fulfillments.find(
    (fulfillment) => fulfillment.type === "Delivery"
  );

  if (deliveryFulfillment.state.descriptor.code === "Pending") {
    // Pre-Ship ETA Breach
    return currentTime >= deliveryETA ? "y" : "n";
  } else {
    // Post-Ship ETA breach
    const ETA = deliveryETA - currentTime;
    const halfETA = ETA / 2;

    let buffer;
    if (data.domain === "ONDC:RET10") {
      buffer = Math.min(0.5 * 60 * 60 * 1000, halfETA);
    } else {
      buffer = Math.min(2 * 24 * 60 * 60 * 1000, halfETA);
    }

    return currentTime >= new Date(deliveryETA.getTime() + buffer) ? "y" : "n";
  }
}

module.exports = isETABreached;
