/* eslint-disable no-undef */
// @ts-nocheck

// Run this here:
// https://cloud.google.com/compute/gpus-pricing?hl=en

table = document.querySelector('table');
rows = [...table.querySelectorAll('tbody tr')];

const result = {};
let currentModel = null;
let currentPrice = null;

rows.forEach((row) => {
  const cells = row.querySelectorAll('td');
  if (cells.length === 6) {
    // First row of a GPU block
    const modelLink = cells[0].querySelector('a');
    if (modelLink) {
      currentModel = modelLink.textContent
        .trim()
        .toLowerCase()
        .replace(/\s+/g, '-')
        .replace(/^nvidia-/, 'nvidia-'); // Normalize e.g., NVIDIA V100
    }
    const priceMatch = cells[3].textContent.trim().match(/\$([\d.]+)/);
    currentPrice = priceMatch ? parseFloat(priceMatch[1]) : null;
  }

  // Push data only once per model (ignore multi-GPU variations)
  if (currentModel && !(currentModel in result) && currentPrice !== null) {
    result[currentModel] = currentPrice;
  }
});

console.log(result);
copy(JSON.stringify(result, null, 2));
