// Upload helpers moved here unchanged from messages.routes.js and profile.routes.js
// (both files had identical copies).

const ALLOWED_ATTACHMENT_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
  'application/pdf',
  'text/csv',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
]);
const ALLOWED_AVATAR_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);

const isAllowedAttachmentType = (mimetype) => ALLOWED_ATTACHMENT_TYPES.has(mimetype);
const isAllowedAvatarType = (mimetype) => ALLOWED_AVATAR_TYPES.has(mimetype);

const getSupabaseConfig = () => {
  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) {
    return null;
  }
  return {
    supabaseUrl: supabaseUrl.replace(/\/$/, ''),
    serviceKey
  };
};

const buildRequestBaseUrl = (req) => {
  const forwardedProto = req.get('x-forwarded-proto');
  const protocol = forwardedProto ? forwardedProto.split(',')[0] : req.protocol;
  return `${protocol}://${req.get('host')}`;
};

module.exports = {
  ALLOWED_ATTACHMENT_TYPES,
  ALLOWED_AVATAR_TYPES,
  isAllowedAttachmentType,
  isAllowedAvatarType,
  getSupabaseConfig,
  buildRequestBaseUrl
};
