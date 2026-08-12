export const joinUserName = (firstName, lastName) => {
  return [firstName, lastName]
    .map(part => String(part || '').trim())
    .filter(Boolean)
    .join(' ');
};

export const getDisplayName = (user, fallback = 'Guest') => {
  if (!user) return fallback;

  const displayName = String(user.displayName || '').trim();
  if (displayName) return displayName;

  const fullName = joinUserName(user.firstName || user.name, user.lastName);
  return fullName || fallback;
};

export const getAvatarLetter = (user, fallback = 'G') => {
  const displayName = typeof user === 'string' ? user : getDisplayName(user, fallback);
  return (displayName || fallback).charAt(0).toUpperCase();
};
