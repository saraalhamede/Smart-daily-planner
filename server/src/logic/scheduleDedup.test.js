import assert from 'node:assert/strict';
import test from 'node:test';
import {
  groupScheduleItemsByTask,
  reconcileScheduleItemsForDate,
  selectCanonicalScheduleRows
} from './scheduleDedup.js';

test('selects the latest full schedule and only newer manual overlays', () => {
  const rows = [
    scheduleRow('old', 'active', '2026-08-05 08:00:00', 'old-item'),
    scheduleRow('old-manual', 'manual', '2026-08-05 08:30:00', 'old-manual-item'),
    scheduleRow('latest', 'active', '2026-08-05 09:00:00', 'latest-item'),
    scheduleRow('new-manual', 'manual', '2026-08-05 09:30:00', 'new-manual-item')
  ];

  const selected = selectCanonicalScheduleRows(rows);
  assert.deepEqual(selected.map((item) => item.schedule_item_id), ['latest-item', 'new-manual-item']);
  assert.equal(Object.hasOwn(selected[0], '_schedule_status'), false);
});

test('completed history replaces waiting duplicates for the same task', () => {
  const tasks = [{
    task_id: 'task-1',
    status: 'completed',
    is_completed: true,
    completed_date: '2026-08-05',
    completed_at: '2026-08-05 11:00:00'
  }];
  const currentItems = [
    item('waiting-1', 'task-1', 'waiting', '2026-08-05 09:00:00', '2026-08-05 10:00:00'),
    item('waiting-2', 'task-1', 'waiting', '2026-08-05 10:00:00', '2026-08-05 11:00:00')
  ];
  const completedHistory = [{
    ...item('completed-1', 'task-1', 'completed', '2026-08-05 09:00:00', '2026-08-05 10:00:00'),
    actual_completed_at: '2026-08-05 11:00:00'
  }];

  const selected = reconcileScheduleItemsForDate(currentItems, completedHistory, tasks, '2026-08-05');
  assert.equal(selected.length, 1);
  assert.equal(selected[0].schedule_item_id, 'completed-1');
  assert.equal(selected[0].status, 'completed');
});

test('groups multiple schedule blocks into one task metric', () => {
  const groups = groupScheduleItemsByTask([
    item('block-1', 'task-1', 'waiting', '2026-08-05 09:00:00', '2026-08-05 09:30:00'),
    item('block-2', 'task-1', 'waiting', '2026-08-05 10:00:00', '2026-08-05 11:00:00'),
    item('block-3', 'task-2', 'in_progress', '2026-08-05 11:00:00', '2026-08-05 11:30:00')
  ]);

  assert.equal(groups.length, 2);
  assert.equal(groups[0].planned_minutes, 90);
  assert.equal(groups[0].representative.schedule_item_id, 'block-1');
  assert.equal(groups[1].representative.status, 'in_progress');
});

function scheduleRow(scheduleId, status, generatedAt, itemId) {
  return {
    schedule_item_id: itemId,
    schedule_id: scheduleId,
    task_id: itemId,
    start_time: '2026-08-05 09:00:00',
    end_time: '2026-08-05 10:00:00',
    status: 'waiting',
    _schedule_id: scheduleId,
    _schedule_date: '2026-08-05',
    _schedule_status: status,
    _schedule_generated_at: generatedAt
  };
}

function item(scheduleItemId, taskId, status, startTime, endTime) {
  return {
    schedule_item_id: scheduleItemId,
    schedule_id: 'schedule-1',
    task_id: taskId,
    title: taskId,
    start_time: startTime,
    end_time: endTime,
    status
  };
}
