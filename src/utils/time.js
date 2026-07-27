const parseTimestamp = (value) => {
  if (!value) return null;

  if (value instanceof Date) {
    return value.getTime();
  }

  if (typeof value === 'string') {
    const hasTimezone = /(?:Z|[+-]\d{2}:?\d{2})$/i.test(value);
    const normalisedValue = hasTimezone ? value : `${value}Z`;
    return new Date(normalisedValue).getTime();
  }

  return new Date(value).getTime();
};

export const formatTimeAgo = (value) => {
  if (!value) return '';

  const timestamp = parseTimestamp(value);
  if (Number.isNaN(timestamp)) return '';

  const diffMs = Math.max(0, Date.now() - timestamp);
  const diffSeconds = Math.floor(diffMs / 1000);

  if (diffSeconds < 30) return 'Just now';
  if (diffSeconds < 60) return `${diffSeconds} seconds ago`;

  const diffMinutes = Math.floor(diffSeconds / 60);
  if (diffMinutes === 1) return '1 minute ago';
  if (diffMinutes < 60) return `${diffMinutes} minutes ago`;

  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours === 1) return '1 hour ago';
  if (diffHours < 24) return `${diffHours} hours ago`;

  const diffDays = Math.floor(diffHours / 24);
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return `${diffDays} days ago`;

  return new Date(timestamp).toLocaleDateString();
};
