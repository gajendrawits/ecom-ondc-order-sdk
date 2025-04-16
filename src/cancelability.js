function isCancellable(data) {
  const allCancellable = data.confirmedItems.every(
    (item) => item.product["@ondc/org/cancellable"] === true
  );
  return allCancellable ? "y" : "n";
}

module.exports = isCancellable;
