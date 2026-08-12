const joinUserName = (firstName, lastName) => {
  return [firstName, lastName]
    .map(part => String(part || '').trim())
    .filter(Boolean)
    .join(' ');
};

const splitDisplayName = (fullName) => {
  const parts = String(fullName || '').trim().split(/\s+/).filter(Boolean);
  if (parts.length <= 1) {
    return { firstName: parts[0] || '', lastName: '' };
  }

  return {
    firstName: parts[0],
    lastName: parts.slice(1).join(' ')
  };
};

const formatUserNameFields = (user) => {
  const firstName = user?.name || '';
  const lastName = user?.last_name || user?.lastName || '';

  return {
    name: firstName,
    firstName,
    lastName,
    displayName: joinUserName(firstName, lastName)
  };
};

module.exports = {
  joinUserName,
  splitDisplayName,
  formatUserNameFields
};
