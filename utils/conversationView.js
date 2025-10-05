const Employee = require('../model/employeeModel');
const Message = require('../model/messageModel');

const getUid = (u) => String((u && (u._id || u.id || u)) || '');

async function buildEmpNameMapFromUsers(users = []) {
  const ids = new Set();
  for (const u of users) {
    if (!u) continue;
    const role = String(u.role || '').toLowerCase();
    if (role === 'karyawan') ids.add(getUid(u));
  }
  if (!ids.size) return new Map();
  const emps = await Employee.find({ user: { $in: Array.from(ids) } })
    .select('user name')
    .lean();
  return new Map(emps.map((e) => [String(e.user), e.name]));
}

function pickDisplayNameWithEmp(userDoc, empMap = new Map()) {
  if (!userDoc) return 'Tanpa Nama';
  const uid = String(userDoc._id || userDoc.id || userDoc) || '';
  const role = String(userDoc.role || '').toLowerCase();
  if (role === 'karyawan')
    return empMap.get(uid) || userDoc.name || userDoc.email || 'Tanpa Nama';
  if (role === 'bot') return userDoc.name || 'Soilab Bot';
  return userDoc.name || userDoc.email || 'Tanpa Nama';
}

async function buildConvViewForViewer(convDoc, viewerUserId) {
  await convDoc.populate({ path: 'members.user', select: 'name email role' });

  const allUsers = (convDoc.members || []).map((m) => m.user).filter(Boolean);
  const empMap = await buildEmpNameMapFromUsers(allUsers);

  const decoratedMembers = (convDoc.members || []).map((m) => {
    const u = m.user;
    return {
      ...(typeof m.toObject === 'function' ? m.toObject() : m),
      user: u
        ? { _id: u._id, name: u.name, email: u.email, role: u.role }
        : null,
      displayName: u ? pickDisplayNameWithEmp(u, empMap) : 'Tanpa Nama'
    };
  });

  const me = decoratedMembers.find(
    (m) => String(m.user?._id || m.user) === String(viewerUserId)
  );
  const hideBefore = me?.deletedAt ? new Date(me.deletedAt) : new Date(0);

  let last = await Message.findOne({
    conversation: convDoc._id,
    createdAt: { $gt: hideBefore }
  })
    .sort({ createdAt: -1, _id: -1 })
    .select('_id text attachments sender createdAt type conversation')
    .populate({ path: 'sender', select: 'name email role' })
    .lean();

  if (last?.sender) {
    last.sender = {
      _id: String(last.sender._id),
      role: last.sender.role,
      name: pickDisplayNameWithEmp(last.sender, empMap),
      email: last.sender.email
    };
  }

  let displayTitle = convDoc.title?.trim() || null;
  if (convDoc.type !== 'group') {
    const other = decoratedMembers.find(
      (m) => String(m.user?._id || m.user) !== String(viewerUserId)
    );
    displayTitle = other?.displayName || displayTitle || 'Tanpa Nama';
  } else {
    displayTitle = displayTitle || 'Tanpa Nama';
  }

  const computedTitle =
    convDoc.type === 'group'
      ? convDoc.title?.trim() || 'Tanpa Nama'
      : displayTitle || 'Tanpa Nama';

  const idStr = String(convDoc._id);

  return {
    _id: idStr,
    id: idStr,
    type: convDoc.type,
    title: computedTitle,
    displayTitle,
    name: displayTitle,
    members: decoratedMembers.map((m) => ({
      user: m.user
        ? {
            _id: String(m.user._id),
            name: m.user.name,
            email: m.user.email,
            role: m.user.role
          }
        : null,
      role: m.role,
      lastReadAt: m.lastReadAt || null,
      pinned: !!m.pinned,
      deletedAt: m.deletedAt || null,
      displayName: m.displayName
    })),
    createdBy: String(convDoc.createdBy || ''),
    createdAt: convDoc.createdAt,
    updatedAt: convDoc.updatedAt,
    expireAt: convDoc.expireAt || null,
    pinnedMessages: convDoc.pinnedMessages || [],
    lastMessageAt: last?.createdAt || null,
    lastMessage: last
      ? {
          id: String(last._id),
          conversationId: idStr,
          sender: last.sender || null,
          type: last.type,
          text: last.text,
          attachments: last.attachments || [],
          createdAt: last.createdAt
        }
      : null
  };
}

module.exports = {
  buildEmpNameMapFromUsers,
  pickDisplayNameWithEmp,
  buildConvViewForViewer
};
