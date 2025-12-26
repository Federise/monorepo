<div class="page">
  <header class="page-header">
    <h1>Data Browser</h1>
    <p>Browse and manage your stored data.</p>
  </header>

  <section class="card">
    <h2>KV Storage</h2>
    <div class="empty-list">
      <p>Data browser coming soon. You'll be able to view and manage KV data stored by apps.</p>
    </div>
  </section>
</div>

<style>
  .page {
    max-width: 900px;
    padding: 2rem 3rem;
  }

  .page-header {
    margin-bottom: 2rem;
  }

  .page-header h1 {
    font-size: var(--font-size-2xl);
    font-weight: 600;
    margin-bottom: var(--space-sm);
    color: var(--color-white);
  }

  .page-header p {
    color: var(--color-text-muted);
    font-size: 0.95rem;
  }

  .card {
    background: var(--surface-1);
    border: 1px solid var(--border-subtle);
    border-radius: var(--radius-xl);
    padding: var(--space-xl);
    margin-bottom: var(--space-xl);
  }

  .card h2 {
    font-size: var(--font-size-lg);
    font-weight: 600;
    margin-bottom: var(--space-sm);
    color: var(--color-white);
  }

  .empty-list {
    padding: var(--space-2xl);
    text-align: center;
    color: var(--color-text-subtle);
  }

  @media (max-width: 900px) {
    .page {
      padding: 1.5rem;
    }
  }
</style>
