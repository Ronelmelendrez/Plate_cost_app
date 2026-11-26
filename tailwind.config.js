/** @type {import('tailwindcss').Config} */
const palette = require('./src/shared/theme/palette.json');

module.exports = {
  // NOTE: Update this to include the paths to all files that contain Nativewind classes.
  content: [
    './app/**/*.{js,jsx,ts,tsx}',
    './src/**/*.{js,jsx,ts,tsx}',
  ],
  presets: [require('nativewind/preset')],
  theme: {
    extend: {
      colors: {
        ...palette,
      },
    },
  },
  plugins: [],
};
