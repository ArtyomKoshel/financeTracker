import { toast } from '@/shared/components/toast';
import { modal } from '@/shared/components/modal';
import {
  getImportRules,
  createImportRule,
  updateImportRule,
  deleteImportRule,
  type ImportRule,
  type ImportRuleConditions,
  type ImportRuleCondition,
} from '@/api/experimental';
import { store } from '@/store';
import type { CategoryWithSubs } from '@/types';

type FieldKey = ImportRuleCondition['field'];
type OperatorKey = ImportRuleCondition['operator'];

const FIELD_OPTIONS: { value: FieldKey; label: string }[] = [
  { value: 'merchant', label: 'Мерчант' },
  { value: 'description', label: 'Описание' },
  { value: 'amount', label: 'Сумма' },
  { value: 'type', label: 'Тип' },
];

const OPERATORS_BY_FIELD: Record<FieldKey, { value: OperatorKey; label: string }[]> = {
  merchant: [
    { value: 'contains', label: 'содержит' },
    { value: 'not_contains', label: 'не содержит' },
    { value: 'equals', label: 'равно' },
    { value: 'starts_with', label: 'начинается с' },
    { value: 'in', label: 'одно из (разделить |)' },
  ],
  description: [
    { value: 'contains', label: 'содержит' },
    { value: 'not_contains', label: 'не содержит' },
    { value: 'equals', label: 'равно' },
    { value: 'starts_with', label: 'начинается с' },
    { value: 'in', label: 'одно из (разделить |)' },
  ],
  amount: [
    { value: 'gt', label: 'больше' },
    { value: 'lt', label: 'меньше' },
    { value: 'gte', label: 'больше или равно' },
    { value: 'lte', label: 'меньше или равно' },
    { value: 'equals', label: 'равно' },
  ],
  type: [
    { value: 'equals', label: 'равно' },
  ],
};

const OPERATOR_LABELS: Record<OperatorKey, string> = {
  contains: 'содержит',
  not_contains: 'не содержит',
  equals: 'равно',
  starts_with: 'начинается с',
  in: 'одно из',
  gt: 'больше',
  lt: 'меньше',
  gte: '≥',
  lte: '≤',
};

const FIELD_LABELS: Record<FieldKey, string> = {
  merchant: 'мерчант',
  description: 'описание',
  amount: 'сумма',
  type: 'тип',
};

function conditionsSummary(conds: ImportRuleConditions | null): string {
  if (!conds || !conds.rules || conds.rules.length === 0) return '—';
  const joiner = conds.logic === 'OR' ? ' ИЛИ ' : ' И ';
  return conds.rules.map(r => {
    const field = FIELD_LABELS[r.field] || r.field;
    const op = OPERATOR_LABELS[r.operator] || r.operator;
    return `${field} ${op} «${r.value}»`;
  }).join(joiner);
}

function flatCategories(): { id: number; name: string; icon: string }[] {
  const cats = store.get('categories') as CategoryWithSubs[];
  const result: { id: number; name: string; icon: string }[] = [];
  for (const c of cats) {
    result.push({ id: c.id, name: c.name, icon: c.icon });
    if (c.subcategories) {
      for (const sub of c.subcategories) {
        result.push({ id: sub.id, name: `  ${c.icon} ${c.name} → ${sub.name}`, icon: sub.icon });
      }
    }
  }
  return result;
}

function escape(s: string): string {
  const d = document.createElement('div');
  d.textContent = s;
  return d.innerHTML;
}

export function createRulesManager(container: HTMLElement, addBtn: HTMLElement): {
  load(): Promise<void>;
  destroy(): void;
} {
  let rules: ImportRule[] = [];
  let activeOverlay: HTMLElement | null = null;

  addBtn.addEventListener('click', () => openModal(null));

  async function load(): Promise<void> {
    try {
      rules = await getImportRules();
      render();
    } catch {
      container.innerHTML = '<p class="empty-state">Ошибка загрузки правил</p>';
    }
  }

  function render(): void {
    if (rules.length === 0) {
      container.innerHTML = '<p class="empty-state">Нет правил. Нажмите «+» чтобы создать.</p>';
      return;
    }

    const rows = rules.map(r => {
      const catLabel = r.category_name
        ? `${r.category_icon || ''} ${escape(r.category_name)}`
        : '<span class="text-muted">—</span>';
      const autoLabel = r.is_auto
        ? '<span class="badge badge-success badge-sm">авто</span>'
        : '<span class="badge badge-secondary badge-sm">ручное</span>';
      const summary = escape(conditionsSummary(r.conditions));

      return `<div class="rule-row" data-rule-id="${r.id}">
        <div class="rule-row__main">
          <div class="rule-row__name">${escape(r.name || r.merchant_pattern || '—')}</div>
          <div class="rule-row__conditions text-muted text-sm">${summary}</div>
        </div>
        <div class="rule-row__meta">
          <span class="rule-row__category">${catLabel}</span>
          ${autoLabel}
          <span class="text-muted text-sm" title="Применено раз">${r.times_applied}×</span>
        </div>
        <div class="rule-row__actions">
          <button class="btn btn-text btn-sm rule-edit-btn" data-rule-id="${r.id}" title="Редактировать">✏️</button>
          <button class="btn btn-text btn-sm rule-delete-btn" data-rule-id="${r.id}" title="Удалить">🗑</button>
        </div>
      </div>`;
    }).join('');

    container.innerHTML = `<div class="rules-list">${rows}</div>`;

    container.querySelectorAll('.rule-edit-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = parseInt((btn as HTMLElement).dataset.ruleId ?? '0');
        const rule = rules.find(r => r.id === id);
        if (rule) openModal(rule);
      });
    });

    container.querySelectorAll('.rule-delete-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = parseInt((btn as HTMLElement).dataset.ruleId ?? '0');
        handleDelete(id);
      });
    });
  }

  async function handleDelete(id: number): Promise<void> {
    const rule = rules.find(r => r.id === id);
    if (!rule) return;
    const label = rule.name || rule.merchant_pattern || `#${id}`;
    if (!confirm(`Удалить правило «${label}»?`)) return;

    try {
      await deleteImportRule(id);
      toast.success('Правило удалено');
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Ошибка удаления');
    }
  }

  function openModal(editing: ImportRule | null): void {
    const isNew = !editing;
    const title = isNew ? 'Новое правило' : 'Редактировать правило';

    const conditions: ImportRuleCondition[] = editing?.conditions?.rules
      ? [...editing.conditions.rules]
      : [{ field: 'merchant', operator: 'contains', value: '' }];
    let logic: 'AND' | 'OR' = editing?.conditions?.logic ?? 'AND';

    const cats = flatCategories();
    const incomeTypes = store.get('incomeTypes') ?? [];

    const content = document.createElement('div');
    content.className = 'rule-modal-content';

    function renderContent(): void {
      const catOptions = cats.map(c =>
        `<option value="${c.id}" ${c.id === (editing?.category_id ?? 0) ? 'selected' : ''}>${escape(c.name)}</option>`
      ).join('');

      const incomeTypeOptions = incomeTypes.map((t: { code: string; label: string; icon: string }) =>
        `<option value="${t.code}" ${t.code === (editing?.result_income_type ?? '') ? 'selected' : ''}>${t.icon} ${escape(t.label)}</option>`
      ).join('');

      const conditionsHtml = conditions.map((c, idx) => buildConditionRow(c, idx)).join('');

      content.innerHTML = `
        <form class="rule-form" autocomplete="off">
          <div class="form-group">
            <label>Название</label>
            <input type="text" name="name" class="form-control" value="${escape(editing?.name || '')}" placeholder="Название правила">
          </div>

          <div class="form-group">
            <label>Логика условий</label>
            <div class="radio-group">
              <label class="radio-label"><input type="radio" name="logic" value="AND" ${logic === 'AND' ? 'checked' : ''}> ВСЕ (И)</label>
              <label class="radio-label"><input type="radio" name="logic" value="OR" ${logic === 'OR' ? 'checked' : ''}> ЛЮБОЕ (ИЛИ)</label>
            </div>
          </div>

          <div class="form-group">
            <label>Условия</label>
            <div class="rule-conditions-list">${conditionsHtml}</div>
            <button type="button" class="btn btn-text btn-sm rule-add-condition-btn">+ Добавить условие</button>
          </div>

          <div class="form-group">
            <label>Категория</label>
            <select name="category_id" class="form-control">
              <option value="">— Без категории —</option>
              ${catOptions}
            </select>
          </div>

          <div class="form-group">
            <label>Тип дохода (если доход)</label>
            <select name="result_income_type" class="form-control">
              <option value="">— Не задан —</option>
              ${incomeTypeOptions}
            </select>
          </div>

          <div class="form-group form-group-row">
            <label class="checkbox-label">
              <input type="checkbox" name="is_auto" ${editing?.is_auto !== false ? 'checked' : ''}> Авто-применение
            </label>
          </div>

          <div class="form-group">
            <label>Приоритет</label>
            <input type="number" name="priority" class="form-control" value="${editing?.priority ?? 0}" min="0" step="1">
          </div>

          <div class="form-actions">
            <button type="button" class="btn btn-secondary rule-cancel-btn">Отмена</button>
            <button type="submit" class="btn btn-primary">${isNew ? 'Создать' : 'Сохранить'}</button>
          </div>
        </form>
      `;

      bindConditionEvents();

      content.querySelector('.rule-add-condition-btn')?.addEventListener('click', () => {
        conditions.push({ field: 'merchant', operator: 'contains', value: '' });
        renderContent();
      });

      content.querySelectorAll<HTMLInputElement>('input[name="logic"]').forEach(radio => {
        radio.addEventListener('change', () => {
          logic = radio.value as 'AND' | 'OR';
        });
      });

      content.querySelector('.rule-cancel-btn')?.addEventListener('click', () => {
        if (activeOverlay) modal.close(activeOverlay);
      });

      const form = content.querySelector<HTMLFormElement>('.rule-form');
      form?.addEventListener('submit', async (e) => {
        e.preventDefault();
        await handleSave(form, editing);
      });
    }

    function buildConditionRow(c: ImportRuleCondition, idx: number): string {
      const fieldOpts = FIELD_OPTIONS.map(f =>
        `<option value="${f.value}" ${f.value === c.field ? 'selected' : ''}>${f.label}</option>`
      ).join('');

      const operators = OPERATORS_BY_FIELD[c.field] || [];
      const opOpts = operators.map(o =>
        `<option value="${o.value}" ${o.value === c.operator ? 'selected' : ''}>${o.label}</option>`
      ).join('');

      const valueInput = c.field === 'type'
        ? `<select class="form-control cond-value" data-idx="${idx}">
            <option value="expense" ${c.value === 'expense' ? 'selected' : ''}>Расход</option>
            <option value="income" ${c.value === 'income' ? 'selected' : ''}>Доход</option>
          </select>`
        : `<input type="${c.field === 'amount' ? 'number' : 'text'}" class="form-control cond-value" data-idx="${idx}" value="${escape(String(c.value))}" placeholder="${c.field === 'amount' ? '0.00' : 'Значение'}" ${c.field === 'amount' ? 'step="0.01"' : ''}>`;

      return `<div class="rule-condition-row" data-idx="${idx}">
        <select class="form-control cond-field" data-idx="${idx}">${fieldOpts}</select>
        <select class="form-control cond-operator" data-idx="${idx}">${opOpts}</select>
        ${valueInput}
        <button type="button" class="btn btn-text btn-sm cond-remove-btn" data-idx="${idx}" ${conditions.length <= 1 ? 'disabled' : ''}>✕</button>
      </div>`;
    }

    function bindConditionEvents(): void {
      content.querySelectorAll<HTMLSelectElement>('.cond-field').forEach(sel => {
        sel.addEventListener('change', () => {
          const idx = parseInt(sel.dataset.idx ?? '0');
          const newField = sel.value as FieldKey;
          conditions[idx].field = newField;
          const ops = OPERATORS_BY_FIELD[newField];
          conditions[idx].operator = ops[0].value;
          conditions[idx].value = '';
          renderContent();
        });
      });

      content.querySelectorAll<HTMLSelectElement | HTMLInputElement>('.cond-operator').forEach(sel => {
        sel.addEventListener('change', () => {
          const idx = parseInt(sel.dataset.idx ?? '0');
          conditions[idx].operator = sel.value as OperatorKey;
        });
      });

      content.querySelectorAll<HTMLInputElement | HTMLSelectElement>('.cond-value').forEach(el => {
        el.addEventListener('input', () => {
          const idx = parseInt(el.dataset.idx ?? '0');
          conditions[idx].value = el.value;
        });
        el.addEventListener('change', () => {
          const idx = parseInt(el.dataset.idx ?? '0');
          conditions[idx].value = el.value;
        });
      });

      content.querySelectorAll('.cond-remove-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          const idx = parseInt((btn as HTMLElement).dataset.idx ?? '0');
          if (conditions.length > 1) {
            conditions.splice(idx, 1);
            renderContent();
          }
        });
      });
    }

    async function handleSave(form: HTMLFormElement, rule: ImportRule | null): Promise<void> {
      const fd = new FormData(form);
      const name = (fd.get('name') as string || '').trim();
      const categoryId = parseInt(fd.get('category_id') as string) || undefined;
      const resultIncomeType = (fd.get('result_income_type') as string) || undefined;
      const isAuto = !!form.querySelector<HTMLInputElement>('input[name="is_auto"]')?.checked;
      const priority = parseInt(fd.get('priority') as string) || 0;

      const validConditions = conditions.filter(c => String(c.value).trim() !== '');
      if (validConditions.length === 0) {
        toast.error('Добавьте хотя бы одно условие с заполненным значением');
        return;
      }

      const conditionsPayload: ImportRuleConditions = {
        logic,
        rules: validConditions.map(c => ({
          field: c.field,
          operator: c.operator,
          value: c.field === 'amount' ? parseFloat(String(c.value)) : String(c.value),
        })),
      };

      const merchantPattern = validConditions
        .filter(c => c.field === 'merchant' && c.operator === 'contains')
        .map(c => String(c.value))
        .join(' ') || name || '';

      const payload = {
        name: name || undefined,
        merchant_pattern: merchantPattern || undefined,
        conditions: conditionsPayload,
        category_id: categoryId,
        result_income_type: resultIncomeType,
        is_auto: isAuto,
        priority,
      };

      try {
        if (rule) {
          await updateImportRule(rule.id, payload);
          toast.success('Правило обновлено');
        } else {
          await createImportRule(payload);
          toast.success('Правило создано');
        }
        if (activeOverlay) modal.close(activeOverlay);
        await load();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : 'Ошибка сохранения');
      }
    }

    renderContent();

    activeOverlay = modal.show({ title, content, closable: true });
  }

  return {
    load,
    destroy: () => {
      container.innerHTML = '';
      if (activeOverlay) {
        modal.close(activeOverlay);
        activeOverlay = null;
      }
    },
  };
}
