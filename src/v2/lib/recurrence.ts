import type { Story } from '../types';

/** Returns YYYY-MM-DD in local timezone (avoids UTC shift from toISOString). */
export function toLocalDateStr(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/**
 * Check if a recurring story applies on a given date.
 * Returns false for non-recurring stories.
 *
 * day_of_week mapping: 1=Mon, 2=Tue, 3=Wed, 4=Thu, 5=Fri, 6=Sat, 0=Sun
 * JS Date.getDay():   0=Sun, 1=Mon, 2=Tue, 3=Wed, 4=Thu, 5=Fri, 6=Sat
 */
export function isRecurringOnDate(story: Story, date: Date): boolean {
  if (!story.frequency) return false;

  if (story.frequency === 'daily') return true;

  if (story.frequency === 'weekly') {
    const jsDay = date.getDay(); // 0=Sun
    // Convert JS day to our mapping: 0=Sun stays 0, rest stays same
    const dayNum = jsDay === 0 ? 0 : jsDay; // 1=Mon...6=Sat, 0=Sun

    // Use recurrence_days if available
    if (story.recurrence_days && story.recurrence_days.length > 0) {
      return story.recurrence_days.includes(dayNum);
    }

    // Fallback to single day_of_week
    if (story.day_of_week != null) {
      return story.day_of_week === dayNum;
    }

    return false;
  }

  if (story.frequency === 'monthly') {
    if (story.day_of_month != null) {
      return date.getDate() === story.day_of_month;
    }
    return false;
  }

  return false;
}

/** Returns a human-readable frequency label. */
export function frequencyLabel(story: Story): string {
  if (!story.frequency) return '';

  const dayNames: Record<number, string> = {
    0: 'Dom', 1: 'Lun', 2: 'Mar', 3: 'Mié', 4: 'Jue', 5: 'Vie', 6: 'Sáb',
  };

  if (story.frequency === 'daily') return 'Diaria';

  if (story.frequency === 'weekly') {
    if (story.recurrence_days && story.recurrence_days.length > 0) {
      if (story.recurrence_days.length >= 6) return 'Semanal (L-S)';
      const names = story.recurrence_days.map(d => dayNames[d] ?? '?').join(', ');
      return `Semanal (${names})`;
    }
    if (story.day_of_week != null) {
      return `Semanal (${dayNames[story.day_of_week] ?? '?'})`;
    }
    return 'Semanal';
  }

  if (story.frequency === 'monthly') {
    if (story.day_of_month != null) {
      return `Mensual (día ${story.day_of_month})`;
    }
    return 'Mensual';
  }

  return '';
}

/** Check if a story is recurring */
export function isRecurring(story: Story): boolean {
  return story.frequency != null;
}

/**
 * For recurring stories: should it appear in active work right now?
 * Returns true if the story is due today, tomorrow, or is overdue.
 * Non-recurring stories always return true (no filtering).
 */
export function shouldShowRecurringInActive(story: Story): boolean {
  if (!story.frequency) return true; // non-recurring — always show

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);

  // Check if it's due today or tomorrow
  return isRecurringOnDate(story, today) || isRecurringOnDate(story, tomorrow);
}
