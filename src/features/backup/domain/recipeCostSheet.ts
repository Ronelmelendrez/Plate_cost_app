export interface RecipeCostSheetLabels {
  generated: string;
  portions: string;
  batchCost: string;
  costPerPlate: string;
  costBreakdown: string;
  item: string;
  quantity: string;
  cost: string;
  salesChannels: string;
  channel: string;
  price: string;
  fees: string;
  profit: string;
  margin: string;
}

export interface RecipeCostSheetData {
  locale: string;
  recipeName: string;
  generatedAt: string;
  portions: string;
  batchCost: string;
  costPerPlate: string;
  breakdown: { name: string; quantity: string; unit: string; cost: string }[];
  channels: {
    name: string;
    price: string;
    fees: string;
    profit: string;
    margin: string;
  }[];
  labels: RecipeCostSheetLabels;
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function buildRecipeCostSheetHtml(data: RecipeCostSheetData) {
  const isRtl = /^(ar|fa|he|ur)(-|$)/i.test(data.locale);
  const breakdownRows = data.breakdown
    .map(
      (row) => `
        <tr>
          <td>${escapeHtml(row.name)}</td>
          <td>${escapeHtml(`${row.quantity} ${row.unit}`)}</td>
          <td>${escapeHtml(row.cost)}</td>
        </tr>`,
    )
    .join('');
  const channelRows = data.channels
    .map(
      (row) => `
        <tr>
          <td>${escapeHtml(row.name)}</td>
          <td>${escapeHtml(row.price)}</td>
          <td>${escapeHtml(row.fees)}</td>
          <td>${escapeHtml(row.profit)}</td>
          <td>${escapeHtml(row.margin)}</td>
        </tr>`,
    )
    .join('');

  return `<!doctype html>
<html lang="${escapeHtml(data.locale)}" dir="${isRtl ? 'rtl' : 'ltr'}">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <style>
      body { color: #1f1b16; font-family: sans-serif; margin: 32px; }
      h1 { font-size: 24px; margin: 0 0 8px; }
      h2 { font-size: 16px; margin: 28px 0 10px; }
      p, th, td { font-size: 12px; }
      .muted { color: #6b645b; }
      .summary { background: #faf8f5; border: 1px solid #e7e2da; border-radius: 10px; padding: 14px; }
      .summary p { margin: 6px 0; }
      table { border-collapse: collapse; width: 100%; }
      th, td { border-bottom: 1px solid #e7e2da; padding: 9px 6px; text-align: start; vertical-align: top; }
      th { color: #6b645b; font-weight: 600; }
      @media print { body { margin: 0; } }
    </style>
  </head>
  <body>
    <h1>${escapeHtml(data.recipeName)}</h1>
    <p class="muted">${escapeHtml(data.labels.generated)} · ${escapeHtml(data.generatedAt)}</p>
    <section class="summary">
      <p><strong>${escapeHtml(data.labels.portions)}:</strong> ${escapeHtml(data.portions)}</p>
      <p><strong>${escapeHtml(data.labels.batchCost)}:</strong> ${escapeHtml(data.batchCost)}</p>
      <p><strong>${escapeHtml(data.labels.costPerPlate)}:</strong> ${escapeHtml(data.costPerPlate)}</p>
    </section>
    <h2>${escapeHtml(data.labels.costBreakdown)}</h2>
    <table>
      <thead><tr>
        <th>${escapeHtml(data.labels.item)}</th>
        <th>${escapeHtml(data.labels.quantity)}</th>
        <th>${escapeHtml(data.labels.cost)}</th>
      </tr></thead>
      <tbody>${breakdownRows}</tbody>
    </table>
    ${
      channelRows
        ? `<h2>${escapeHtml(data.labels.salesChannels)}</h2>
    <table>
      <thead><tr>
        <th>${escapeHtml(data.labels.channel)}</th>
        <th>${escapeHtml(data.labels.price)}</th>
        <th>${escapeHtml(data.labels.fees)}</th>
        <th>${escapeHtml(data.labels.profit)}</th>
        <th>${escapeHtml(data.labels.margin)}</th>
      </tr></thead>
      <tbody>${channelRows}</tbody>
    </table>`
        : ''
    }
  </body>
</html>`;
}
