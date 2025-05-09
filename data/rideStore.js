// data/rideStore.js
const fs = require('fs');
const path = require('path');
const rideFile = path.join(__dirname, 'rides.json');

let rideStore = {};

// Load from file
function load() {
  if (fs.existsSync(rideFile)) {
    try {
      rideStore = JSON.parse(fs.readFileSync(rideFile, 'utf-8'));
      console.log(`[🗃️] Loaded ${Object.keys(rideStore).length} rides from disk.`);
    } catch (err) {
      console.warn('⚠️ Failed to load ride store:', err);
      rideStore = {};
    }
  }
}

// Save to file
function save() {
  fs.writeFileSync(rideFile, JSON.stringify(rideStore, null, 2));
}

// Standard functions
function addRide(messageId, rideData) {
  rideStore[messageId] = rideData;
  save();
}

function getRide(messageId) {
  return rideStore[messageId];
}

function removeRide(messageId) {
  delete rideStore[messageId];
  save();
}

function getAllRides() {
  return rideStore;
}

// Exports
module.exports = {
  load,
  addRide,
  getRide,
  removeRide,
  getAllRides,
};
