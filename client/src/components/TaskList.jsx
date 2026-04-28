export function TaskList({ tasks }) {
  const openTasks = tasks.filter((task) => !task.is_completed);

  return (
    <section className="panel">
      <div className="panel-head">
        <div>
          <p className="eyebrow">Task Bank</p>
          <h2>Open tasks</h2>
        </div>
        <span className="soft-pill">{openTasks.length} active</span>
      </div>

      <div className="item-list">
        {openTasks.length === 0 ? (
          <p className="empty-state">No active tasks yet.</p>
        ) : (
          openTasks.map((task) => (
            <article className={`task-row ${task.is_fixed_time ? 'fixed' : 'flexible'}`} key={task.task_id}>
              <div>
                <strong>{task.title}</strong>
                <p>{task.description || 'No description'}</p>
              </div>
              <div className="chip-line">
                <span>{task.is_fixed_time ? 'Fixed' : 'Flexible'}</span>
                <span>{task.category || 'general'}</span>
                <span>Priority {task.priority_level}</span>
                <span>Remaining {task.remaining_duration_minutes}m</span>
              </div>
            </article>
          ))
        )}
      </div>
    </section>
  );
}
