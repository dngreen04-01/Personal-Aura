const express = require('express');
const { asyncHandler } = require('../middleware/errorHandler');
const {
  getSharedLocations,
  getSharedLocationById,
  createSharedLocation,
  addEquipmentContribution,
  reportMissingEquipment,
  claimSharedLocation,
} = require('../services/firestore');

const router = express.Router();

// GET / — List/search shared locations
router.get('/', asyncHandler(async (req, res) => {
  const { lat, lon, radius, search, limit } = req.query;
  const result = await getSharedLocations({
    lat: lat ? parseFloat(lat) : undefined,
    lon: lon ? parseFloat(lon) : undefined,
    radiusKm: radius ? parseFloat(radius) : 25,
    search,
    limit: limit ? parseInt(limit, 10) : 50,
  });
  res.json({ locations: result });
}));

// GET /:locationId — Single location detail
router.get('/:locationId', asyncHandler(async (req, res) => {
  const location = await getSharedLocationById(req.params.locationId);
  if (!location) {
    return res.status(404).json({ error: 'Location not found' });
  }
  const isContributor = (location.contributors || []).includes(req.uid);
  res.json({ ...location, isContributor });
}));

// POST / — Create shared location
router.post('/', asyncHandler(async (req, res) => {
  const { name, address, lat, lon, equipment } = req.body;
  if (!name || lat == null || lon == null) {
    return res.status(400).json({ error: 'name, lat, and lon are required' });
  }
  const result = await createSharedLocation({
    name,
    address,
    lat,
    lon,
    equipment,
    createdBy: req.uid,
  });
  res.status(201).json(result);
}));

// POST /:locationId/equipment — Add equipment contribution
router.post('/:locationId/equipment', asyncHandler(async (req, res) => {
  const { equipmentId } = req.body;
  if (!equipmentId) {
    return res.status(400).json({ error: 'equipmentId is required' });
  }
  await addEquipmentContribution(req.params.locationId, req.uid, equipmentId);
  res.json({ success: true });
}));

// POST /:locationId/report-missing — Report missing equipment
router.post('/:locationId/report-missing', asyncHandler(async (req, res) => {
  const { equipmentId } = req.body;
  if (!equipmentId) {
    return res.status(400).json({ error: 'equipmentId is required' });
  }
  await reportMissingEquipment(req.params.locationId, req.uid, equipmentId);
  res.json({ success: true });
}));

// POST /:locationId/claim — Claim location as contributor
router.post('/:locationId/claim', asyncHandler(async (req, res) => {
  const result = await claimSharedLocation(req.params.locationId, req.uid);
  res.json(result);
}));

module.exports = router;
