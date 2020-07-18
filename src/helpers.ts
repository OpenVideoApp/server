export function unixTime() {
  return Math.round((new Date()).getTime() / 1000);
}