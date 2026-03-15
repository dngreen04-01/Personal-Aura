const express = require('express');
const { asyncHandler } = require('../middleware/errorHandler');
const {
  getExercises,
  getExerciseById,
  getExercisesByNames,
  getExerciseAlternatives,
} = require('../services/firestore');

const router = express.Router();

// GET / — List/search exercises
router.get('/', asyncHandler(async (req, res) => {
  const { category, equipment, difficulty, muscle, search, limit, startAfter } = req.query;
  const result = await getExercises({
    category,
    equipment,
    difficulty,
    muscle,
    search,
    limit: limit ? parseInt(limit, 10) : 50,
    startAfter,
  });
  res.json(result);
}));

// POST /by-names — Bulk lookup by exercise names
router.post('/by-names', asyncHandler(async (req, res) => {
  const { names } = req.body;
  if (!names || !Array.isArray(names)) {
    return res.status(400).json({ error: 'names array required' });
  }
  const exercises = await getExercisesByNames(names);
  res.json({ exercises });
}));

// GET /:exerciseId — Single exercise detail
router.get('/:exerciseId', asyncHandler(async (req, res) => {
  const exercise = await getExerciseById(req.params.exerciseId);
  if (!exercise) {
    return res.status(404).json({ error: 'Exercise not found' });
  }
  res.json(exercise);
}));

// GET /:exerciseId/alternatives — Get alternative exercises
router.get('/:exerciseId/alternatives', asyncHandler(async (req, res) => {
  const alternatives = await getExerciseAlternatives(req.params.exerciseId);
  res.json({ alternatives });
}));

module.exports = router;
