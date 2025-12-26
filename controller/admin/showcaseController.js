const asyncHandler = require('express-async-handler');
const throwError = require('../../utils/throwError');
const Showcase = require('../../model/showcaseModel');
const { uploadBuffer, deleteFile, getFileUrl } = require('../../utils/wasabi');
const path = require('path');
const formatDate = require('../../utils/formatDate');

const addShowcase = asyncHandler(async (req, res) => {
  const { project_name, location, date_start, date_end } = req.body || {};

  if (!project_name || !location)
    throwError('Field project_name dan location harus diisi', 400);

  let imgMeta = null;

  if (req.file) {
    const file = req.file;
    const ext = path.extname(file.originalname);
    const key = `galeri_proyek/${project_name}/img_${formatDate()}${ext}`;

    await uploadBuffer(key, file.buffer, { contentType: file.mimetype });

    imgMeta = {
      key,
      contentType: file.mimetype,
      size: file.size,
      uploadedAt: new Date()
    };
  }

  const showcase = await Showcase.create({
    project_name,
    location,
    img: imgMeta,
    date_start,
    date_end
  });

  res.status(201).json({
    message: 'Galeri proyek berhasil ditambahkan',
    data: showcase
  });
});

const getShelfs = asyncHandler(async (req, res) => {
  const mode = req.query.mode || 'paging';
  const limit = parseInt(req.query.limit) || 10;
  const search = req.query.search || '';

  const filter = search
    ? {
        $or: [
          { shelf_name: { $regex: search, $options: 'i' } },
          { shelf_code: { $regex: search, $options: 'i' } }
        ]
      }
    : {};

  if (req.query.warehouse) filter.warehouse = req.query.warehouse;

  // ===== PAGING =====
  if (mode === 'paging') {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const skip = (page - 1) * limit;

    const totalItems = await Shelf.countDocuments(filter);
    const data = await Shelf.find(filter)
      .populate('warehouse', 'warehouse_name warehouse_code')
      .skip(skip)
      .limit(limit)
      .sort({ createdAt: -1 })
      .lean();

    return res.json({
      page,
      limit,
      totalItems,
      totalPages: Math.ceil(totalItems / limit),
      data
    });
  }

  // ===== CURSOR (ASLI) =====
  if (mode === 'cursor') {
    if (req.query.cursor)
      filter.createdAt = { $lt: new Date(req.query.cursor) };

    const rows = await Shelf.find(filter)
      .populate('warehouse', 'warehouse_name warehouse_code')
      .sort({ createdAt: -1 })
      .limit(limit + 1)
      .lean();

    const hasMore = rows.length > limit;
    const data = hasMore ? rows.slice(0, limit) : rows;

    return res.json({
      data,
      nextCursor: hasMore ? data[data.length - 1].createdAt : null,
      hasMore
    });
  }

  throwError('mode pagination tidak valid', 400);
});

const getShowcase = asyncHandler(async (req, res) => {
  const showcase = await Showcase.findById(req.params.id);
  if (!showcase) throwError('Galeri proyek tidak ditemukan!', 400);

  let imgUrl = null;
  if (showcase.img?.key) imgUrl = await getFileUrl(showcase.img.key, 86400);

  res.status(200).json({
    ...showcase.toObject(),
    imgUrl
  });
});

const updateShowcase = asyncHandler(async (req, res) => {
  const { project_name, location, date_start, date_end } = req.body || {};

  const showcase = await Showcase.findById(req.params.id);
  if (!showcase) throwError('Galeri proyek tidak ditemukan!', 404);

  if (project_name) showcase.project_name = project_name;
  if (location) showcase.location = location;
  if (date_start) showcase.date_start = date_start;
  if (date_end) showcase.date_end = date_end;

  if (req.file) {
    const file = req.file;
    const ext = path.extname(file.originalname);

    if (showcase.img?.key) {
      await deleteFile(showcase.img.key);
    }

    const key = `galeri_proyek/${
      showcase.project_name
    }/img_${formatDate()}${ext}`;
    await uploadBuffer(key, file.buffer, { contentType: file.mimetype });

    showcase.img = {
      key,
      contentType: file.mimetype,
      size: file.size,
      uploadedAt: new Date()
    };
  }

  await showcase.save();
  res.status(200).json({
    message: 'Galeri proyek berhasil diperbarui',
    data: showcase
  });
});

const removeShowcase = asyncHandler(async (req, res) => {
  const showcase = await Showcase.findById(req.params.id);
  if (!showcase) throwError('Galeri proyek tidak ditemukan!', 400);

  if (showcase.img?.key) {
    await deleteFile(showcase.img.key);
  }

  await showcase.deleteOne();
  res.status(200).json({ message: 'Galeri proyek berhasil dihapus.' });
});

module.exports = {
  addShowcase,
  getShowcases,
  getShowcase,
  removeShowcase,
  updateShowcase
};
