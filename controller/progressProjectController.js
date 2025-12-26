const asyncHandler = require('express-async-handler');
const ProgressProject = require('../model/progressProjectModel');
const throwError = require('../utils/throwError');

function computeOverallPercent(doc) {
  const jobs = ['sondir', 'bor', 'cptu'];
  let total = 0,
    done = 0;
  for (const j of jobs) {
    const p = doc?.progress?.[j] || {};
    total += Number(p.total_points) || 0;
    done += Number(p.completed_points) || 0;
  }
  return total ? Math.round((done / total) * 100) : 0;
}

const getProjects = asyncHandler(async (req, res) => {
  const mode = req.query.mode || 'paging';
  const limit = Math.min(parseInt(req.query.limit) || 10, 50);

  const search = req.query.search || '';
  const filter = search
    ? {
        $or: [
          { project_name: { $regex: search, $options: 'i' } },
          { location: { $regex: search, $options: 'i' } }
        ]
      }
    : {};

  if (req.query.client) filter.client = req.query.client;

  const sortOption = { createdAt: -1 };

  if (mode === 'paging') {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const skip = (page - 1) * limit;

    const totalItems = await ProgressProject.countDocuments(filter);
    const data = await ProgressProject.find(filter)
      .populate('client', 'name')
      .skip(skip)
      .limit(limit)
      .sort(sortOption)
      .lean();

    return res.json({
      mode: 'paging',
      page,
      limit,
      totalItems,
      totalPages: Math.ceil(totalItems / limit),
      data
    });
  }

  if (mode === 'cursor') {
    if (req.query.cursor)
      filter.createdAt = { $lt: new Date(req.query.cursor) };

    const rows = await ProgressProject.find(filter)
      .populate('client', 'name')
      .sort(sortOption)
      .limit(limit + 1)
      .lean();

    const hasMore = rows.length > limit;
    const data = hasMore ? rows.slice(0, limit) : rows;

    return res.json({
      mode: 'cursor',
      data,
      nextCursor: hasMore ? data[data.length - 1].createdAt : null,
      hasMore
    });
  }

  throwError('mode pagination tidak valid', 400);
});

const getProject = asyncHandler(async (req, res) => {
  const project = await ProgressProject.findById(req.params.id)
    .populate('client', 'name')
    .lean();

  if (!project) throwError('Proyek tidak ditemukan', 404);

  res.status(200).json({
    ...project,
    overall_percent: computeOverallPercent(project)
  });
});

const updateProjectTotals = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const body = req.body || {};

  const proj = await ProgressProject.findById(id);
  if (!proj) throwError('Proyek tidak ditemukan', 404);

  const jobs = ['sondir', 'bor', 'cptu'];

  for (const job of jobs) {
    if (body[job] === undefined) continue;

    const newTotal = Number(body[job]);
    if (!Number.isInteger(newTotal) || newTotal < 0) {
      throwError(`Total titik ${job} harus bilangan bulat ≥ 0`, 400);
    }

    const completed = Number(proj.progress[job]?.completed_points) || 0;
    if (newTotal < completed) {
      throwError(
        `Total titik ${job} tidak boleh lebih kecil dari titik yang sudah selesai (${completed})`,
        400
      );
    }

    proj.progress[job].total_points = newTotal;
  }

  await proj.save();

  const snap = (j) => ({
    total_points: proj.progress[j].total_points,
    completed_points: proj.progress[j].completed_points
  });

  res.status(200).json({
    message: 'Total titik proyek diperbarui',
    progress: {
      sondir: snap('sondir'),
      bor: snap('bor'),
      cptu: snap('cptu')
    },
    overall_percent: proj.overall_percent
  });
});

module.exports = {
  getProjects,
  getProject,
  updateProjectTotals
};
