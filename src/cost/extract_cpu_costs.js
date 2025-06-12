/* eslint-disable no-undef */
// @ts-nocheck

// Run this here:
// https://cloud.google.com/compute/vm-instance-pricing?hl=en

tables = document.querySelectorAll('table');
result = {};

tables.forEach((table) => {
  const rows = table.querySelectorAll('tbody tr');
  rows.forEach((row) => {
    const cells = row.querySelectorAll('td');
    if (cells.length !== 4) return;

    const type = cells[0].innerText.trim();
    const vcpus = parseInt(cells[1].innerText.trim(), 10);
    const memText = cells[2].innerText.trim();
    const memoryMatch = memText.match(/([\d.]+)\s*GiB/i);
    const memory_gb = memoryMatch ? parseFloat(memoryMatch[1]) : null;

    const priceText = cells[3].innerText.trim();
    const priceMatch = priceText.match(/\$([\d.]+)/);
    const usd_per_hour = priceMatch ? parseFloat(priceMatch[1]) : null;

    result[type] = {
      vcpus,
      memory_gb,
      usd_per_hour,
    };
  });
});

console.log(result);
copy(JSON.stringify(result, null, 2));
