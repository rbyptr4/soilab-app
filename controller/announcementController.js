const asyncHandler = require('express-async-handler');
const Announcement = require('../model/announcementModel');
const throwError = require('../utils/throwError');

function calcExpire(days) {
  if (!days) return null; // null = never expire
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000);
}

const createAnnouncement = asyncHandler(async (req, res) => {
  const { title, body, duration } = req.body;
  if (!title) throwError('Judul wajib diisi', 400);

  const expiresAt = duration ? calcExpire(duration) : null;

  const ann = await Announcement.create({
    title,
    body,
    expiresAt,
    createdBy: req.user.id
  });

  res.status(201).json({ message: 'Announcement dibuat', data: ann });
});

const getAllAnnouncements = asyncHandler(async (req, res) => {
  const limit = parseInt(req.query.limit) || 10;
  const { status, search, cursor } = req.query;
  const now = new Date();

  const filter = {};

  if (status === 'active') {
    filter.activeFrom = { $lte: now };
    filter.$or = [{ expiresAt: null }, { expiresAt: { $gt: now } }];
  } else if (status === 'expired') {
    filter.expiresAt = { $ne: null, $lte: now };
  }

  if (search) {
    filter.$or = [
      { title: { $regex: search, $options: 'i' } },
      { body: { $regex: search, $options: 'i' } }
    ];
  }

  if (cursor) filter.createdAt = { $lt: new Date(cursor) };

  const rows = await Announcement.find(filter)
    .populate('createdBy', 'name email')
    .sort({ createdAt: -1 })
    .limit(limit + 1)
    .lean();

  const hasMore = rows.length > limit;
  const data = hasMore ? rows.slice(0, limit) : rows;
  const nextCursor = hasMore ? data[data.length - 1].createdAt : null;

  res.json({ data, nextCursor, hasMore });
});

const deleteAnnouncement = asyncHandler(async (req, res) => {
  const ann = await Announcement.findByIdAndDelete(req.params.id);
  if (!ann) throwError('Announcement tidak ada', 404);

  res.json({ message: 'Announcement dihapus' });
});

const getAnnouncementById = asyncHandler(async (req, res) => {
  const ann = await Announcement.findById(req.params.id).lean();
  if (!ann) throwError('Announcement tidak ada', 404);

  res.json({ data: ann });
});

const updateAnnouncement = asyncHandler(async (req, res) => {
  const { title, body, duration } = req.body;
  if (!title) throwError('Judul wajib diisi', 400);

  const expiresAt = duration ? calcExpire(duration) : null;

  const ann = await Announcement.findByIdAndUpdate(
    req.params.id,
    { title, body, expiresAt },
    { new: true }
  );

  if (!ann) throwError('Announcement tidak ada', 404);

  res.json({ message: 'Announcement di update', data: ann });
});

const getActiveAnnouncements = asyncHandler(async (req, res) => {
  const now = new Date();
  const anns = await Announcement.find({
    activeFrom: { $lte: now },
    $or: [{ expiresAt: null }, { expiresAt: { $gt: now } }]
  })
    .select('title body createdAt expiresAt')
    .sort({ createdAt: -1 })
    .lean();

  if (!anns.length) throwError('Tidak ada announcement yang aktif!', 404);

  res.json({ data: anns });
});

module.exports = {
  createAnnouncement,
  getAllAnnouncements,
  deleteAnnouncement,
  getAnnouncementById,
  updateAnnouncement,
  getActiveAnnouncements
};
