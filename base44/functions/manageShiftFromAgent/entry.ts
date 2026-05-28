import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

const normalizeDate = (value) => {
  if (!value) return null;
  return String(value).split('T')[0];
};

const addDays = (dateString, days) => {
  const date = new Date(`${dateString}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return normalizeDate(date.toISOString());
};

const addMonths = (dateString, months) => {
  const date = new Date(`${dateString}T12:00:00Z`);
  const day = date.getUTCDate();
  date.setUTCDate(1);
  date.setUTCMonth(date.getUTCMonth() + months);
  const lastDay = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)).getUTCDate();
  date.setUTCDate(Math.min(day, lastDay));
  return normalizeDate(date.toISOString());
};

const resolveShiftValue = (hospital, shiftType, shiftKind, shiftDate) => {
  if (shiftKind === 'sobreaviso') {
    return Number(hospital.valor_sobreaviso || 0);
  }

  if (shiftKind === 'avista') {
    return 0;
  }

  const date = new Date(`${shiftDate}T12:00:00Z`);
  const weekday = date.getUTCDay();
  const isWeekend = weekday === 0 || weekday === 6;

  if (shiftType === 'SD') {
    return Number(isWeekend ? hospital.valor_sd_fds || hospital.valor_sd_semana || 0 : hospital.valor_sd_semana || 0);
  }

  return Number(isWeekend ? hospital.valor_sn_fds || hospital.valor_sn_semana || 0 : hospital.valor_sn_semana || 0);
};

const buildRecurringDates = (date, recurrence) => {
  if (!recurrence || recurrence === 'none') return [date];

  const dates = [date];
  for (let index = 1; index < 12; index += 1) {
    if (recurrence === 'weekly') dates.push(addDays(date, index * 7));
    if (recurrence === 'biweekly') dates.push(addDays(date, index * 14));
    if (recurrence === 'monthly') dates.push(addMonths(date, index));
  }
  return dates;
};

const normalizeHospitalText = (value) => String(value || '').toLowerCase().trim();

const findHospitalMatches = (hospitals, hospitalText) => {
  const normalizedHospitalText = normalizeHospitalText(hospitalText);
  if (!normalizedHospitalText) return [];

  const exactSiglaMatches = hospitals.filter((hospital) => normalizeHospitalText(hospital.sigla) === normalizedHospitalText);
  if (exactSiglaMatches.length > 0) return exactSiglaMatches;

  const exactNameMatches = hospitals.filter((hospital) => normalizeHospitalText(hospital.name) === normalizedHospitalText);
  if (exactNameMatches.length > 0) return exactNameMatches;

  return hospitals.filter((hospital) => normalizeHospitalText(hospital.name).includes(normalizedHospitalText));
};

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const payload = await req.json().catch(() => ({}));
    const { action, shift_id, hospital_id, hospital_query, hospital_confirmed, date, type, shift_kind, valor, notes, status, recurrence } = payload;

    if (!action) {
      return Response.json({ error: 'action is required' }, { status: 400 });
    }

    if (action === 'create') {
      if (!hospital_id || !date || !type) {
        return Response.json({ error: 'hospital_id, date and type are required' }, { status: 400 });
      }

      const hospital = await base44.entities.Hospital.get(hospital_id);
      const hospitals = await base44.entities.Hospital.list();
      const matches = findHospitalMatches(hospitals, hospital_query || hospital.name || hospital.sigla);

      if (!hospital_confirmed) {
        return Response.json({
          error: 'hospital_confirmation_required',
          message: 'Confirmação explícita do hospital é obrigatória antes de criar o plantão.',
          matches: matches.map((item) => ({ id: item.id, name: item.name, sigla: item.sigla })),
        }, { status: 400 });
      }

      if (matches.length !== 1 || matches[0].id !== hospital_id) {
        return Response.json({
          error: 'ambiguous_hospital',
          message: 'O hospital informado está ambíguo ou não corresponde ao hospital confirmado.',
          matches: matches.map((item) => ({ id: item.id, name: item.name, sigla: item.sigla })),
        }, { status: 400 });
      }
      const normalizedDate = normalizeDate(date);
      const normalizedKind = shift_kind || 'regular';
      const dates = buildRecurringDates(normalizedDate, normalizedKind === 'regular' ? recurrence : 'none');

      const shifts = [];
      for (const shiftDate of dates) {
        const resolvedValue = valor !== undefined ? Number(valor || 0) : resolveShiftValue(hospital, type, normalizedKind, shiftDate);
        const shift = await base44.entities.Shift.create({
          hospital_id,
          date: shiftDate,
          type,
          shift_kind: normalizedKind,
          status: status || 'scheduled',
          valor: resolvedValue,
          notes: notes || undefined,
        });
        shifts.push(shift);
      }

      return Response.json({ success: true, action: 'create', shifts, shift: shifts[0] || null, recurrence: recurrence || 'none' });
    }

    if (action === 'update') {
      if (!shift_id) {
        return Response.json({ error: 'shift_id is required' }, { status: 400 });
      }

      let resolvedValue;
      if (valor !== undefined) {
        resolvedValue = Number(valor || 0);
      } else if (hospital_id || date || type || shift_kind) {
        const currentShift = await base44.entities.Shift.get(shift_id);
        const resolvedHospitalId = hospital_id || currentShift.hospital_id;
        const resolvedDate = normalizeDate(date || currentShift.date);
        const resolvedType = type || currentShift.type;
        const resolvedKind = shift_kind || currentShift.shift_kind;
        const hospital = await base44.entities.Hospital.get(resolvedHospitalId);
        resolvedValue = resolveShiftValue(hospital, resolvedType, resolvedKind, resolvedDate);
      }

      const updateData = {
        ...(hospital_id ? { hospital_id } : {}),
        ...(date ? { date: normalizeDate(date) } : {}),
        ...(type ? { type } : {}),
        ...(shift_kind ? { shift_kind } : {}),
        ...(status ? { status } : {}),
        ...(resolvedValue !== undefined ? { valor: resolvedValue } : {}),
        ...(notes !== undefined ? { notes: notes || undefined } : {}),
      };

      const shift = await base44.entities.Shift.update(shift_id, updateData);
      return Response.json({ success: true, action: 'update', shift });
    }

    if (action === 'delete') {
      if (!shift_id) {
        return Response.json({ error: 'shift_id is required' }, { status: 400 });
      }

      await base44.entities.Shift.delete(shift_id);
      return Response.json({ success: true, action: 'delete', shift_id });
    }

    return Response.json({ error: 'invalid action' }, { status: 400 });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});