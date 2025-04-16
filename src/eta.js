export function isETABreached(etaTime, currentTime) {
  return new Date(currentTime) > new Date(etaTime);
}
