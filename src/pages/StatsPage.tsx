import { useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router'
import {
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { isValidIsoDate, todayIso } from '../../shared/dates.ts'
import type { StatsResponse } from '../../shared/types.ts'
import { shortDateLabel } from '../../shared/weeks.ts'
import { api } from '../api.ts'
import Notice from '../components/Notice.tsx'
import { errorMessage, plural } from '../util.ts'

const PRESENT_COLOR = '#2e7d4f' // --ok
const ABSENT_COLOR = '#8a96a8' // neutral slate, distinct from green for colour-blind users too
const LINE_COLOR = '#1f4e79' // --brand

type Metric = 'rate' | 'present'

function percent(rate: number | null, digits = 0): string {
  return rate === null ? '—' : `${(rate * 100).toFixed(digits)}%`
}

export default function StatsPage() {
  const [params, setParams] = useSearchParams()
  const groupIds = params.getAll('group')
  const from = validDate(params.get('from'))
  const to = validDate(params.get('to'))
  const today = todayIso()
  const key = JSON.stringify([groupIds, from, to, today])

  const [result, setResult] = useState<{ key: string; data?: StatsResponse; error?: string }>()
  const [metric, setMetric] = useState<Metric>('rate')

  useEffect(() => {
    document.title = 'Statistics · Group Attendance'
  }, [])

  useEffect(() => {
    let cancelled = false
    const [ids, f, t, d] = JSON.parse(key) as [string[], string | undefined, string | undefined, string]
    api.getStats({ groupIds: ids, from: f ?? undefined, to: t ?? undefined, today: d }).then(
      (data) => !cancelled && setResult({ key, data }),
      (err) => !cancelled && setResult({ key, error: errorMessage(err) }),
    )
    return () => {
      cancelled = true
    }
  }, [key])

  // Keep showing the previous results while a new filter loads.
  const [shown, setShown] = useState<StatsResponse>()
  if (result?.data && result.data !== shown) setShown(result.data)
  const loading = result?.key !== key
  const error = !loading ? result?.error : undefined
  const data = shown

  function update(change: (p: URLSearchParams) => void) {
    const next = new URLSearchParams(params)
    change(next)
    setParams(next, { replace: true })
  }

  function toggleGroup(id?: string) {
    update((p) => {
      if (!id) {
        p.delete('group')
        return
      }
      const current = p.getAll('group')
      p.delete('group')
      const next = current.includes(id) ? current.filter((g) => g !== id) : [...current, id]
      for (const g of next) p.append('group', g)
    })
  }

  function setDate(name: 'from' | 'to', value: string) {
    update((p) => (value ? p.set(name, value) : p.delete(name)))
  }

  const selected = new Set(data?.filter.groupIds ?? groupIds)
  const allSelected = selected.size === 0
  const rangeInvalid = Boolean(from && to && from > to)

  const weekData = useMemo(
    () =>
      (data?.weeks ?? []).map((w) => ({
        ...w,
        label: shortDateLabel(w.weekStart),
        ratePct: w.rate === null ? null : Math.round(w.rate * 1000) / 10,
        presentCount: w.meetings ? w.present : null,
      })),
    [data],
  )

  const totals = data?.totals
  const pieData = totals
    ? [
        { name: 'Present', value: totals.present, color: PRESENT_COLOR },
        { name: 'Absent', value: totals.absent, color: ABSENT_COLOR },
      ]
    : []
  const hasData = Boolean(totals && totals.expected > 0)
  const filterLabel = allSelected
    ? 'all groups'
    : data?.allGroups
        .filter((g) => selected.has(g.id))
        .map((g) => g.name)
        .join(', ')

  return (
    <>
      <h1>Statistics</h1>

      <section className="card stats-filters" aria-label="Filters">
        <div className="field">
          <span id="group-filter-label">Groups</span>
          <div className="chips" role="group" aria-labelledby="group-filter-label">
            <button type="button" className="chip" aria-pressed={allSelected} onClick={() => toggleGroup()}>
              All groups
            </button>
            {data?.allGroups.map((g) => (
              <button
                key={g.id}
                type="button"
                className="chip"
                aria-pressed={selected.has(g.id)}
                onClick={() => toggleGroup(g.id)}
              >
                {g.name}
              </button>
            ))}
          </div>
        </div>
        <div className="date-range">
          <label className="field">
            <span>From</span>
            <input type="date" value={from ?? ''} max={to} onChange={(e) => setDate('from', e.target.value)} />
          </label>
          <label className="field">
            <span>To</span>
            <input type="date" value={to ?? ''} min={from} onChange={(e) => setDate('to', e.target.value)} />
          </label>
          {(from || to) && (
            <button
              type="button"
              className="link-button"
              onClick={() =>
                update((p) => {
                  p.delete('from')
                  p.delete('to')
                })
              }
            >
              Clear dates
            </button>
          )}
        </div>
      </section>

      {rangeInvalid && <Notice kind="error">“From” must be on or before “To”.</Notice>}
      {error && !rangeInvalid && <Notice kind="error">{error}</Notice>}
      {!data && !error && <p className="muted">Loading statistics…</p>}

      {data && totals && (
        <div className={loading ? 'stats-body is-loading' : 'stats-body'} aria-busy={loading}>
          <p className="muted small stats-scope">
            Showing {filterLabel}
            {from || to ? ` · ${from ? shortDateLabel(from, true) : 'start'} – ${to ? shortDateLabel(to, true) : 'today'}` : ''}
          </p>

          <div className="stats">
            <div className="stat">
              <span className="stat-value">{percent(totals.rate)}</span>
              <span className="stat-label">Attendance</span>
            </div>
            <div className="stat">
              <span className="stat-value">
                {totals.present}
                <span className="stat-of"> / {totals.expected}</span>
              </span>
              <span className="stat-label">Present / expected</span>
            </div>
            <div className="stat">
              <span className="stat-value">{totals.meetingsWithAttendance}</span>
              <span className="stat-label">{totals.meetingsWithAttendance === 1 ? 'Meeting' : 'Meetings'} recorded</span>
            </div>
          </div>
          {(totals.meetingsWithoutAttendance > 0 || totals.upcomingMeetings > 0) && (
            <p className="muted small">
              {totals.meetingsWithoutAttendance > 0 &&
                `${plural(totals.meetingsWithoutAttendance, 'past meeting')} without attendance taken (not counted). `}
              {totals.upcomingMeetings > 0 && `${plural(totals.upcomingMeetings, 'upcoming meeting')}.`}
            </p>
          )}

          {!hasData ? (
            <div className="card empty">
              <p>
                No attendance has been recorded{allSelected ? '' : ' for this selection'}
                {from || to ? ' in this date range' : ''} yet.
              </p>
              <p className="muted small">Statistics appear here once attendance is taken for a meeting.</p>
            </div>
          ) : (
            <>
              <div className="chart-grid">
                <section className="card chart-card">
                  <h2>Present vs absent</h2>
                  <div className="chart pie-chart">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={pieData}
                          dataKey="value"
                          nameKey="name"
                          innerRadius="55%"
                          outerRadius="85%"
                          startAngle={90}
                          endAngle={-270}
                          stroke="#fff"
                          strokeWidth={2}
                          isAnimationActive={false}
                        >
                          {pieData.map((d) => (
                            <Cell key={d.name} fill={d.color} />
                          ))}
                        </Pie>
                        <Tooltip
                          formatter={(value, name) => [
                            `${value} (${percent(Number(value) / totals.expected, 1)})`,
                            name,
                          ]}
                        />
                        <Legend verticalAlign="bottom" />
                      </PieChart>
                    </ResponsiveContainer>
                    <div className="pie-center" aria-hidden="true">
                      {percent(totals.rate)}
                    </div>
                  </div>
                  <p className="sr-only">
                    {totals.present} present and {totals.absent} absent, {percent(totals.rate, 1)} attendance.
                  </p>
                </section>

                <section className="card chart-card wide">
                  <div className="section-head">
                    <h2>By week</h2>
                    <div className="segmented" role="group" aria-label="Weekly chart shows">
                      <button type="button" aria-pressed={metric === 'rate'} onClick={() => setMetric('rate')}>
                        %
                      </button>
                      <button type="button" aria-pressed={metric === 'present'} onClick={() => setMetric('present')}>
                        Present
                      </button>
                    </div>
                  </div>
                  <div className="chart line-chart">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={weekData} margin={{ top: 8, right: 12, bottom: 0, left: -12 }}>
                        <CartesianGrid stroke="#e5e9ef" vertical={false} />
                        <XAxis dataKey="label" tick={{ fontSize: 12 }} minTickGap={12} />
                        <YAxis
                          tick={{ fontSize: 12 }}
                          allowDecimals={false}
                          domain={metric === 'rate' ? [0, 100] : [0, 'auto']}
                          tickFormatter={(v) => (metric === 'rate' ? `${v}%` : String(v))}
                        />
                        <Tooltip
                          labelFormatter={(_, payload) => {
                            const w = payload?.[0]?.payload as (typeof weekData)[number] | undefined
                            return w ? `Week of ${shortDateLabel(w.weekStart, true)}` : ''
                          }}
                          formatter={(_, __, item) => {
                            const w = item.payload as (typeof weekData)[number]
                            return [
                              `${percent(w.rate, 1)} · ${w.present}/${w.expected} present · ${plural(w.meetings, 'meeting')}`,
                              'Attendance',
                            ]
                          }}
                        />
                        <Line
                          type="linear"
                          dataKey={metric === 'rate' ? 'ratePct' : 'presentCount'}
                          name={metric === 'rate' ? 'Attendance %' : 'Present'}
                          stroke={LINE_COLOR}
                          strokeWidth={2.5}
                          dot={{ r: 3 }}
                          activeDot={{ r: 5 }}
                          connectNulls={false}
                          isAnimationActive={false}
                        />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                  <p className="muted small">
                    Weeks run Sunday–Saturday. Gaps are weeks with no attendance recorded.
                  </p>
                </section>
              </div>

              <section className="card">
                <h2>By group</h2>
                <div className="grid-scroll">
                  <table className="grid stats-table">
                    <thead>
                      <tr>
                        <th scope="col">Group</th>
                        <th scope="col">Recorded</th>
                        <th scope="col">Not taken</th>
                        <th scope="col">Present</th>
                        <th scope="col">Attendance</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.groups.map((g) => (
                        <tr key={g.id}>
                          <th scope="row">
                            <Link to={`/groups/${g.id}/history`}>{g.name}</Link>
                          </th>
                          <td>{g.meetingsWithAttendance}</td>
                          <td>{g.meetingsWithoutAttendance}</td>
                          <td>
                            {g.present} / {g.expected}
                          </td>
                          <td>
                            <strong>{percent(g.rate)}</strong>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            </>
          )}

          <details className="how-calculated muted small">
            <summary>How is attendance calculated?</summary>
            <p>
              Attendance is the number of people marked present divided by the number expected, across every
              meeting where attendance was taken. Meetings without attendance are left out.
            </p>
            <p>
              A member is expected at a meeting if they were in the group on the meeting day or when attendance
              was saved. Members who were later removed still count for the meetings they belonged to; members
              added afterwards don’t count against earlier meetings. Anyone marked present is always counted.
            </p>
          </details>
        </div>
      )}
    </>
  )
}

function validDate(value: string | null): string | undefined {
  return value && isValidIsoDate(value) ? value : undefined
}
