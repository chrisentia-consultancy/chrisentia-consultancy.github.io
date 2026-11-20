/* Tailwind theme. Previously duplicated inline in all three pages.
   Loaded after the Tailwind CDN script and before the page renders.

   NOTE (Layer 4): cdn.tailwindcss.com is not intended for production — it
   ships the whole framework and compiles in the browser. Replacing it with a
   prebuilt stylesheet is part of the performance pass. */

tailwind.config = {
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        primary: '#e8f0f7',
        'primary-container': '#d4e6f1',
        'on-surface': '#2d3748',
        'on-surface-variant': '#718096',
        'surface-dim': '#f0f4f8',
        background: '#fafbfc'
      },
      fontFamily: {
        h1: ['Hanken Grotesk'],
        h2: ['Hanken Grotesk'],
        h3: ['Hanken Grotesk'],
        'body-lg': ['Inter'],
        'body-sm': ['Inter']
      }
    }
  }
};
