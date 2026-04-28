export function ScheduleView({ schedule, items, renderFeedback }) {
  return (
    <section className="panel schedule-panel">
      <div className="panel-head">
        <div>
          <p className="eyebrow">Daily Schedule</p>
          <h2>Generated plan</h2>
        </div>
        {schedule ? <span className="soft-pill">{schedule.status}</span> : null}
      </div>

      {schedule?.schedule_note ? <p className="schedule-note">{schedule.schedule_note}</p> : null}

      <div className="timeline">
        {items.length === 0 ? (
          <p className="empty-state">Generate a schedule after check-in and tasks.</p>
        ) : (
          items.map((item) => (
            <article className={`schedule-row ${item.task_kind === 'fixed' ? 'fixed' : 'flexible'}`} key={item.schedule_item_id}>
              <time>
                {formatTime(item.start_time)}
                <span>{formatTime(item.end_time)}</span>
              </time>
              <div className="schedule-body">
                <div className="row-heading">
                  <strong>{item.title}</strong>
                  <span>{item.task_kind === 'fixed' ? 'Fixed' : item.energy_slot}</span>
                </div>
                <p>{item.reason}</p>
                {item.task_kind === 'flexible' ? renderFeedback(item) : null}
              </div>
            </article>
          ))
        )}
      </div>
    </section>
  );
}

function formatTime(value) {
  return new Intl.DateTimeFormat('en', {
    hour: '2-digit',
    minute: '2-digit'
  }).format(new Date(value));
}
