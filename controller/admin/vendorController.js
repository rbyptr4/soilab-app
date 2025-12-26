const asyncHandler = require('express-async-handler');
const throwError = require('../../utils/throwError');
const Vendor = require('../../model/vendorModel');

const addVendor = asyncHandler(async (req, res) => {
  const {
    name,
    address,
    npwp,
    phone,
    bank_account_number,
    emergency_contact_number
  } = req.body || {};

  if (
    !name ||
    !address ||
    !phone ||
    !npwp ||
    !bank_account_number ||
    !emergency_contact_number
  )
    throwError('Field ini harus diisi', 400);

  const vendor = await Vendor.create({
    name,
    address,
    npwp,
    phone,
    bank_account_number,
    emergency_contact_number
  });

  res.status(201).json(vendor);
});

const getVendors = asyncHandler(async (req, res) => {
  const limit = parseInt(req.query.limit) || 10;
  const cursor = req.query.cursor;
  const search = req.query.search || '';

  const filter = search
    ? {
        $or: [
          { name: { $regex: search, $options: 'i' } },
          { email: { $regex: search, $options: 'i' } }
        ]
      }
    : {};

  if (cursor) filter.createdAt = { $lt: new Date(cursor) };

  const rows = await Vendor.find(filter)
    .sort({ createdAt: -1 })
    .limit(limit + 1)
    .lean();

  const hasMore = rows.length > limit;
  const data = hasMore ? rows.slice(0, limit) : rows;
  const nextCursor = hasMore ? data[data.length - 1].createdAt : null;

  res.json({ data, nextCursor, hasMore });
});

const getVendor = asyncHandler(async (req, res) => {
  const vendor = await Vendor.findById(req.params.id);
  if (!vendor) throwError('Vendor tidak terdaftar!', 400);

  res.status(200).json(vendor);
});

const removeVendor = asyncHandler(async (req, res) => {
  const vendor = await Vendor.findById(req.params.id);
  if (!vendor) throwError('Vendor tidak terdaftar!', 400);

  await Vendor.findByIdAndDelete(req.params.id);
  res.status(200).json({ message: 'Vendor berhasil dihapus.' });
});

const updateVendor = asyncHandler(async (req, res) => {
  const {
    name,
    address,
    npwp,
    phone,
    bank_account_number,
    emergency_contact_number
  } = req.body || {};

  const vendor = await Vendor.findById(req.params.id);
  if (!vendor) throwError('Vendor berhasil dihapus', 404);

  vendor.name = name || vendor.name;
  vendor.address = address || vendor.address;
  vendor.npwp = npwp || vendor.npwp;
  vendor.phone = phone || vendor.phone;
  vendor.bank_account_number =
    bank_account_number || vendor.bank_account_number;
  vendor.emergency_contact_number =
    emergency_contact_number || vendor.emergency_contact_number;

  await vendor.save();
  res.status(200).json(vendor);
});

module.exports = {
  addVendor,
  getVendors,
  getVendor,
  removeVendor,
  updateVendor
};
