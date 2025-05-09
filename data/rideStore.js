// data/rideStore.js
const rideStore = {};

function addRide(messageId, rideData) {
  rideStore[messageId] = rideData;
}

function getRide(messageId) {
  return rideStore[messageId];
}

function removeRide(messageId) {
  delete rideStore[messageId];
}

function getAllRides() {
  return rideStore;
}

module.exports = {
  addRide,
  getRide,
  removeRide,
  getAllRides,
};
