// LHCI puppeteerScript: seed 100 tasks into localStorage before the audit so
// the FR-48 performance budget is measured under load, not against an empty app.
const TASK_COUNT = 100;

module.exports = async (browser, context) => {
  const page = await browser.newPage();
  await page.goto(context.url, { waitUntil: 'domcontentloaded' });
  await page.evaluate((count) => {
    const pad = (n) => String(n).padStart(2, '0');
    const tasks = [];
    const base = new Date();
    for (let i = 0; i < count; i++) {
      const due = new Date(base.getFullYear(), base.getMonth(), base.getDate() + (i % 14) - 3);
      tasks.push({
        id: `seed-${i}`,
        title: `Seeded task ${i} for the lighthouse load audit`,
        status: 'open',
        dueDate: `${due.getFullYear()}-${pad(due.getMonth() + 1)}-${pad(due.getDate())}`,
        dueTime: i % 4 === 0 ? `${pad(9 + (i % 9))}:00` : null,
        list: i % 3 === 0 ? 'work' : i % 3 === 1 ? 'home' : null,
        priority: i % 5 === 0 ? 1 : null,
        recurrence: null,
        createdAt: new Date().toISOString(),
        completedAt: null,
        order: i + 1,
      });
    }
    localStorage.setItem('todo-quantum.v1', JSON.stringify({ schemaVersion: 1, tasks }));
  }, TASK_COUNT);
  await page.close();
};
