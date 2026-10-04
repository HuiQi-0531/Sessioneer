// jest-dom adds custom jest matchers for asserting on DOM nodes,
// e.g. expect(element).toHaveTextContent(/react/i)
import '@testing-library/jest-dom';
import { TextEncoder, TextDecoder } from 'util';

// React Router v7 uses TextEncoder, which CRA's jsdom (Jest 27) does not provide.
if (typeof global.TextEncoder === 'undefined') global.TextEncoder = TextEncoder;
if (typeof global.TextDecoder === 'undefined') global.TextDecoder = TextDecoder;
