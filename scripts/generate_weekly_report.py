#!/usr/bin/env python3
"""
Study Tracker — Weekly Academic Performance & CGPA 4.00 PDF Generator
Powered by Python, Pandas, Matplotlib, and Seaborn.
Reads student telemetry JSON from stdin and writes a multi-page vector PDF to sys.argv[1].
"""

import json
import os
import sys
from datetime import datetime

os.environ.setdefault("MPLCONFIGDIR", "/tmp/matplotlib")

import matplotlib
matplotlib.use("Agg")

import matplotlib.pyplot as plt
import matplotlib.patches as patches
from matplotlib.backends.backend_pdf import PdfPages
import numpy as np
import pandas as pd
import seaborn as sns


def safe_str(val, max_len=60):
    if val is None:
        return ""
    s = str(val).replace("\n", " ").replace("\r", " ").strip()
    if len(s) > max_len:
        return s[: max_len - 1] + "…"
    return s


def draw_header_banner(fig, title, subtitle, meta_right):
    banner = patches.FancyBboxPatch(
        (0.03, 0.905),
        0.94,
        0.072,
        boxstyle="round,pad=0.004,rounding_size=0.012",
        facecolor="#0f172a",
        edgecolor="#1e3a8a",
        linewidth=1.2,
        transform=fig.transFigure,
        zorder=2,
    )
    fig.patches.append(banner)

    # Futuristic cyan/cobalt accent strip on top edge of banner
    accent = patches.Rectangle(
        (0.03, 0.973),
        0.94,
        0.004,
        facecolor="#06b6d4",
        edgecolor="none",
        transform=fig.transFigure,
        zorder=3,
    )
    fig.patches.append(accent)

    fig.text(
        0.048,
        0.948,
        title,
        fontsize=14,
        fontweight="bold",
        color="#f8fafc",
        family="DejaVu Sans",
        zorder=4,
    )
    fig.text(
        0.048,
        0.921,
        subtitle,
        fontsize=8.5,
        color="#94a3b8",
        family="DejaVu Sans",
        zorder=4,
    )
    fig.text(
        0.952,
        0.935,
        meta_right,
        fontsize=8.2,
        color="#38bdf8",
        ha="right",
        va="center",
        family="DejaVu Sans Mono",
        zorder=4,
    )


def draw_footer(fig, page_num, total_pages, student_email):
    fig.text(
        0.035,
        0.018,
        f"Study Tracker · Seaborn Python Telemetry Report · {safe_str(student_email, 50)}",
        fontsize=7.5,
        color="#64748b",
        family="DejaVu Sans",
    )
    fig.text(
        0.965,
        0.018,
        f"Page {page_num} of {total_pages}",
        fontsize=7.5,
        color="#64748b",
        ha="right",
        family="DejaVu Sans Mono",
    )


def draw_kpi_card(fig, x, y, w, h, label, value, sub, accent_hex="#2563eb"):
    card = patches.FancyBboxPatch(
        (x, y),
        w,
        h,
        boxstyle="round,pad=0.003,rounding_size=0.010",
        facecolor="#f8fafc",
        edgecolor="#cbd5e1",
        linewidth=0.9,
        transform=fig.transFigure,
        zorder=2,
    )
    fig.patches.append(card)
    top_bar = patches.Rectangle(
        (x, y + h - 0.004),
        w,
        0.004,
        facecolor=accent_hex,
        edgecolor="none",
        transform=fig.transFigure,
        zorder=3,
    )
    fig.patches.append(top_bar)
    fig.text(x + 0.014, y + h - 0.022, label, fontsize=8, color="#475569", fontweight="bold")
    fig.text(
        x + 0.014,
        y + h - 0.056,
        value,
        fontsize=15.5,
        color="#0f172a",
        fontweight="bold",
        family="DejaVu Sans Mono",
    )
    fig.text(x + 0.014, y + 0.012, sub, fontsize=7.5, color="#64748b")


def render_table(ax, headers, rows, col_widths=None, empty_msg="No records available."):
    ax.axis("off")
    if not rows:
        ax.text(
            0.5,
            0.5,
            empty_msg,
            ha="center",
            va="center",
            fontsize=9,
            color="#64748b",
            style="italic",
        )
        return

    table = ax.table(
        cellText=rows,
        colLabels=headers,
        colWidths=col_widths,
        loc="upper center",
        cellLoc="left",
    )
    table.auto_set_font_size(False)
    table.set_fontsize(7.6)
    table.scale(1.0, 1.38)

    for (r, c), cell in table.get_celld().items():
        cell.set_edgecolor("#e2e8f0")
        cell.set_linewidth(0.6)
        if r == 0:
            cell.set_facecolor("#0f172a")
            cell.set_text_props(color="#f8fafc", fontweight="bold")
        else:
            cell.set_facecolor("#ffffff" if r % 2 == 1 else "#f8fafc")
            cell.set_text_props(color="#1e293b")


def build_pdf(payload: dict, output_path: str):
    sns.set_theme(
        style="whitegrid",
        rc={
            "axes.edgecolor": "#cbd5e1",
            "grid.color": "#e2e8f0",
            "grid.linestyle": "--",
            "grid.linewidth": 0.6,
            "font.family": "DejaVu Sans",
        },
    )

    profile = payload.get("profile") or {}
    gpa = payload.get("gpaReport") or {}
    metrics = payload.get("metrics") or {}
    daily_7 = payload.get("daily7Days") or []
    daily_28 = payload.get("daily28Days") or []
    courses = payload.get("courses") or []
    sessions = payload.get("sessions") or []
    topics = payload.get("topics") or []
    notes = payload.get("notes") or []

    student_name = safe_str(profile.get("displayName") or "Student", 40)
    student_email = safe_str(profile.get("email") or "", 50)
    friend_code = safe_str(profile.get("friendCode") or "—", 20)
    scale_label = "BD 4.00" if profile.get("gradingScale") == "bd" else "US 4.00"
    gen_date = safe_str((payload.get("generatedAt") or datetime.utcnow().isoformat())[:10], 16)

    weekly_mins = float(metrics.get("weeklyMinutes") or 0)
    goal_mins = max(30.0, float(profile.get("weeklyGoalMinutes") or 600))
    weekly_hrs = weekly_mins / 60.0
    goal_hrs = goal_mins / 60.0
    goal_pct = min(999, int(round((weekly_mins / goal_mins) * 100)))

    cgpa_val = float(gpa.get("cgpa") or 0.0)
    completed_credits = float(gpa.get("completedCredits") or 0.0)
    streak_days = int(metrics.get("streakDays") or 0)
    total_sessions = int(metrics.get("totalSessions") or len(sessions))
    done_topics = int(metrics.get("doneTopics") or 0)
    total_topics = int(metrics.get("totalTopics") or len(topics))
    mastery_pct = int(round((done_topics / total_topics) * 100)) if total_topics > 0 else 0

    extra_courses = courses[14:]
    extra_sessions = sessions[10:]
    extra_topics = topics[12:]
    extra_notes = notes[12:]

    overflow_pages = []
    for i in range(0, len(extra_courses), 22):
        overflow_pages.append(("Additional Courses & Grades (Continued)", ["Code", "Course Title", "Semester", "Cr", "Grade", "Pts/4.00", "Midterm", "Topics", "Time"], [
            [
                safe_str(c.get("code"), 14),
                safe_str(c.get("title"), 30),
                safe_str(c.get("semester"), 14),
                f"{float(c.get('credits') or 0):.1f}",
                safe_str(c.get("gradeLetter") or ("In Prog" if not c.get("isCompleted") else "—"), 8),
                f"{float(c.get('gradePoints')):.2f}" if c.get("gradePoints") is not None else "—",
                f"{c.get('midtermPct')}%" if c.get("midtermPct") is not None else "—",
                f"{int(c.get('doneTopics') or 0)}/{int(c.get('totalTopics') or 0)}",
                f"{float(c.get('studyMinutes') or 0) / 60.0:.1f}h",
            ]
            for c in extra_courses[i : i + 22]
        ], [0.10, 0.27, 0.13, 0.06, 0.08, 0.09, 0.09, 0.09, 0.09]))

    for i in range(0, len(extra_sessions), 22):
        overflow_pages.append(("Study Sessions Archive (Continued)", ["Date", "Course", "Source", "Duration", "Reflection / Note"], [
            [
                safe_str((s.get("date") or "")[:10], 12),
                safe_str(s.get("courseCode") or "GENERAL", 14),
                safe_str(s.get("source") or "timer", 10).title(),
                f"{int(s.get('durationMinutes') or 0)} min",
                safe_str(s.get("note") or "—", 52),
            ]
            for s in extra_sessions[i : i + 22]
        ], [0.13, 0.14, 0.11, 0.12, 0.50]))

    for i in range(0, len(extra_topics), 22):
        overflow_pages.append(("Syllabus Topics Archive (Continued)", ["Course", "Topic", "Status", "Due Date"], [
            [
                safe_str(t.get("courseCode") or "—", 12),
                safe_str(t.get("title") or "Topic", 48),
                safe_str(t.get("status") or "todo", 10).upper(),
                safe_str(t.get("dueDate") or "—", 14),
            ]
            for t in extra_topics[i : i + 22]
        ], [0.15, 0.53, 0.14, 0.18]))

    for i in range(0, len(extra_notes), 22):
        overflow_pages.append(("Notes & Files Archive (Continued)", ["Course", "Title", "Type", "Drive"], [
            [
                safe_str(n.get("courseCode") or "GENERAL", 12),
                safe_str(n.get("title") or n.get("originalFilename") or "Note", 52),
                "FILE" if n.get("kind") == "file" else "NOTE",
                "Yes" if n.get("hasDriveBackup") else "Local",
            ]
            for n in extra_notes[i : i + 22]
        ], [0.15, 0.55, 0.14, 0.16]))

    total_pages = 3 + len(overflow_pages)

    with PdfPages(output_path) as pdf:
        # =====================================================================
        # PAGE 1: EXECUTIVE WEEKLY TELEMETRY & SEABORN VISUALIZATIONS
        # =====================================================================
        fig = plt.figure(figsize=(11, 8.5), dpi=150)
        fig.patch.set_facecolor("#ffffff")

        draw_header_banner(
            fig,
            f"Weekly Performance Report — {student_name}",
            f"Student ID: {friend_code}  |  Scale: {scale_label}  |  Generated: {gen_date}  |  Engine: Python + Seaborn",
            f"CGPA {cgpa_val:.2f} / 4.00",
        )

        # 4 KPI Cards
        card_y = 0.775
        card_h = 0.105
        card_w = 0.222
        gap = 0.0173
        draw_kpi_card(
            fig,
            0.03,
            card_y,
            card_w,
            card_h,
            f"CUMULATIVE CGPA ({scale_label})",
            f"{cgpa_val:.2f} / 4.00" if completed_credits > 0 else "— / 4.00",
            f"{completed_credits:.1f} graded credits (incl. prior)",
            "#06b6d4",
        )
        draw_kpi_card(
            fig,
            0.03 + (card_w + gap),
            card_y,
            card_w,
            card_h,
            "WEEKLY STUDY FOCUS",
            f"{weekly_hrs:.1f}h / {goal_hrs:.0f}h",
            f"{goal_pct}% of weekly target reached",
            "#2563eb",
        )
        draw_kpi_card(
            fig,
            0.03 + 2 * (card_w + gap),
            card_y,
            card_w,
            card_h,
            "STREAK & SESSIONS",
            f"{streak_days}d Streak",
            f"{total_sessions} total sessions ({float(metrics.get('totalMinutes') or 0) / 60.0:.1f}h all-time)",
            "#10b981",
        )
        draw_kpi_card(
            fig,
            0.03 + 3 * (card_w + gap),
            card_y,
            card_w,
            card_h,
            "SYLLABUS MASTERY",
            f"{mastery_pct}% Done",
            f"{done_topics} / {total_topics} topics · {len(courses)} courses",
            "#8b5cf6",
        )

        # Chart 1 (Top Left): Seaborn 7-Day Daily Study Minutes Barplot
        ax1 = fig.add_axes([0.065, 0.43, 0.43, 0.28])
        daily_target = max(15.0, goal_mins / 7.0)
        if daily_7:
            df7 = pd.DataFrame(daily_7)
            df7["status"] = np.where(df7["minutes"] >= daily_target, "Target Met", "Below Target")
            palette = {"Target Met": "#10b981", "Below Target": "#2563eb"}
            sns.barplot(
                data=df7,
                x="label",
                y="minutes",
                hue="status",
                palette=palette,
                dodge=False,
                ax=ax1,
            )
            ax1.axhline(daily_target, color="#f59e0b", linestyle="--", linewidth=1.3, label=f"Daily Target ({daily_target:.0f}m)")
            for bar in ax1.patches:
                h_val = bar.get_height()
                if h_val > 0:
                    ax1.text(
                        bar.get_x() + bar.get_width() / 2.0,
                        h_val + max(2, df7["minutes"].max() * 0.025),
                        f"{int(round(h_val))}m",
                        ha="center",
                        va="bottom",
                        fontsize=7.2,
                        color="#334155",
                        family="DejaVu Sans Mono",
                    )
            ax1.legend(loc="upper right", fontsize=7, frameon=True, facecolor="#ffffff")
        else:
            ax1.text(0.5, 0.5, "No 7-day study logs yet", ha="center", va="center", color="#64748b")
        ax1.set_title("7-Day Daily Study Pace (Seaborn Bar Telemetry)", fontsize=10, fontweight="bold", color="#0f172a", pad=10)
        ax1.set_xlabel("")
        ax1.set_ylabel("Minutes Studied", fontsize=8.5, color="#475569")
        ax1.tick_params(labelsize=8)
        sns.despine(ax=ax1)

        # Chart 2 (Top Right): Seaborn Horizontal Course Study Time Breakdown
        ax2 = fig.add_axes([0.575, 0.43, 0.39, 0.28])
        course_mins = []
        for c in courses:
            m = float(c.get("studyMinutes") or 0)
            if m > 0:
                course_mins.append({"course": safe_str(c.get("code") or "COURSE", 14), "hours": m / 60.0})
        # Also include GENERAL sessions if present
        gen_mins = sum(
            float(s.get("durationMinutes") or 0)
            for s in sessions
            if (s.get("courseCode") or "GENERAL").upper() == "GENERAL"
        )
        if gen_mins > 0:
            course_mins.append({"course": "GENERAL", "hours": gen_mins / 60.0})

        if course_mins:
            dfc = pd.DataFrame(course_mins).sort_values("hours", ascending=False).head(7)
            sns.barplot(
                data=dfc,
                y="course",
                x="hours",
                hue="course",
                palette="crest",
                dodge=False,
                ax=ax2,
            )
            if ax2.get_legend():
                ax2.get_legend().remove()
            for bar in ax2.patches:
                w_val = bar.get_width()
                if w_val > 0:
                    ax2.text(
                        w_val + max(0.05, dfc["hours"].max() * 0.02),
                        bar.get_y() + bar.get_height() / 2.0,
                        f"{w_val:.1f}h",
                        va="center",
                        ha="left",
                        fontsize=7.3,
                        color="#334155",
                        family="DejaVu Sans Mono",
                    )
            ax2.set_xlim(0, max(1.0, dfc["hours"].max() * 1.18))
        else:
            ax2.text(0.5, 0.5, "Log sessions to see course breakdown", ha="center", va="center", color="#64748b")
        ax2.set_title("Study Hours by Course (All Logged Sessions)", fontsize=10, fontweight="bold", color="#0f172a", pad=10)
        ax2.set_xlabel("Hours", fontsize=8.5, color="#475569")
        ax2.set_ylabel("")
        ax2.tick_params(labelsize=8)
        sns.despine(ax=ax2)

        # Chart 3 (Bottom Full Width): Seaborn 28-Day Consistency Matrix Heatmap (4 weeks x 7 days)
        ax3 = fig.add_axes([0.065, 0.085, 0.90, 0.25])
        if len(daily_28) >= 28:
            vals = [float(d.get("minutes") or 0) for d in daily_28[-28:]]
            labels_28 = [safe_str(d.get("date", "")[5:], 5) for d in daily_28[-28:]]
            matrix = np.array(vals).reshape(4, 7)
            annot_matrix = np.array(
                [f"{lbl}\n{int(round(v))}m" if v > 0 else f"{lbl}\n0m" for lbl, v in zip(labels_28, vals)]
            ).reshape(4, 7)
            sns.heatmap(
                matrix,
                annot=annot_matrix,
                fmt="",
                cmap="YlGnBu",
                linewidths=1.5,
                linecolor="#ffffff",
                cbar_kws={"label": "Minutes / Day", "shrink": 0.9},
                annot_kws={"fontsize": 7.2, "family": "DejaVu Sans Mono"},
                yticklabels=["Week -4", "Week -3", "Week -2", "Current Wk"],
                xticklabels=["Day 1", "Day 2", "Day 3", "Day 4", "Day 5", "Day 6", "Day 7"],
                ax=ax3,
            )
        else:
            ax3.text(0.5, 0.5, "28-day consistency map unavailable", ha="center", va="center", color="#64748b")
        ax3.set_title("28-Day Study Consistency Matrix (Seaborn Intensity Heatmap)", fontsize=10, fontweight="bold", color="#0f172a", pad=8)
        ax3.tick_params(labelsize=8)

        draw_footer(fig, 1, total_pages, student_email)
        pdf.savefig(fig)
        plt.close(fig)

        # =====================================================================
        # PAGE 2: CGPA 4.00 TRAJECTORY, COURSE PERFORMANCE & FULL COURSE MATRIX
        # =====================================================================
        fig2 = plt.figure(figsize=(11, 8.5), dpi=150)
        fig2.patch.set_facecolor("#ffffff")

        draw_header_banner(
            fig2,
            f"CGPA 4.00 Trajectory & Course Matrix — {student_name}",
            f"Grading Scale: {scale_label} (Max 4.00)  |  Prior Record: {float(gpa.get('priorCgpa') or 0):.2f} CGPA across {float(gpa.get('priorCredits') or 0):.1f} cr",
            f"Quality Pts: {float(gpa.get('totalQualityPoints') or 0):.1f}",
        )

        # Chart 4 (Top Left): Seaborn Semester SGPA & Cumulative CGPA Lineplot (0.00 - 4.00)
        ax4 = fig2.add_axes([0.065, 0.555, 0.43, 0.285])
        semesters = gpa.get("semesters") or []
        if semesters:
            prior_cr = float(gpa.get("priorCredits") or 0.0)
            prior_qp = prior_cr * float(gpa.get("priorCgpa") or 0.0)
            cum_cr = prior_cr
            cum_qp = prior_qp
            rows_sem = []
            for s in semesters:
                sc = float(s.get("credits") or 0)
                sgpa_val = float(s.get("sgpa") or 0)
                cum_cr += sc
                cum_qp += sc * sgpa_val
                cum_cgpa = cum_qp / cum_cr if cum_cr > 0 else 0.0
                rows_sem.append({"Semester": safe_str(s.get("semester"), 14), "Metric": "Semester SGPA", "GPA": sgpa_val})
                rows_sem.append({"Semester": safe_str(s.get("semester"), 14), "Metric": "Cumulative CGPA", "GPA": cum_cgpa})
            dfs = pd.DataFrame(rows_sem)
            sns.lineplot(
                data=dfs,
                x="Semester",
                y="GPA",
                hue="Metric",
                style="Metric",
                markers=True,
                dashes=False,
                linewidth=2.3,
                markersize=7,
                palette={"Semester SGPA": "#10b981", "Cumulative CGPA": "#2563eb"},
                ax=ax4,
            )
            ax4.axhline(4.0, color="#06b6d4", linestyle=":", linewidth=1.1, label="4.00 Max")
            ax4.set_ylim(0, 4.25)
            ax4.legend(loc="lower right", fontsize=7.2, frameon=True, facecolor="#ffffff")
            if len(semesters) > 4:
                ax4.tick_params(axis="x", rotation=20)
        else:
            ax4.set_ylim(0, 4.25)
            ax4.text(0.5, 2.1, "Assign grades to courses to chart 4.00 SGPA/CGPA trend", ha="center", va="center", fontsize=8.5, color="#64748b")
        ax4.set_title("CGPA 4.00 Trajectory (Semester SGPA vs Cumulative CGPA)", fontsize=10, fontweight="bold", color="#0f172a", pad=10)
        ax4.set_xlabel("")
        ax4.set_ylabel("GPA (0.00 – 4.00)", fontsize=8.5, color="#475569")
        ax4.tick_params(labelsize=7.8)
        sns.despine(ax=ax4)

        # Chart 5 (Top Right): Course Midterm % vs Syllabus Mastery % (Seaborn Grouped Barplot)
        ax5 = fig2.add_axes([0.565, 0.555, 0.40, 0.285])
        perf_rows = []
        for c in courses[:8]:
            code = safe_str(c.get("code") or "COURSE", 12)
            tot_t = int(c.get("totalTopics") or 0)
            done_t = int(c.get("doneTopics") or 0)
            syl_pct = round((done_t / tot_t) * 100) if tot_t > 0 else 0
            perf_rows.append({"Course": code, "Dimension": "Syllabus %", "Percent": syl_pct})
            mid_pct = c.get("midtermPct")
            if mid_pct is not None:
                perf_rows.append({"Course": code, "Dimension": "Midterm %", "Percent": float(mid_pct)})

        if perf_rows:
            dfp = pd.DataFrame(perf_rows)
            sns.barplot(
                data=dfp,
                x="Course",
                y="Percent",
                hue="Dimension",
                palette={"Syllabus %": "#2563eb", "Midterm %": "#f59e0b"},
                ax=ax5,
            )
            ax5.set_ylim(0, 112)
            ax5.legend(loc="upper right", fontsize=7.2, frameon=True, facecolor="#ffffff")
            if dfp["Course"].nunique() > 5:
                ax5.tick_params(axis="x", rotation=20)
        else:
            ax5.set_ylim(0, 105)
            ax5.text(0.5, 50, "Add courses & syllabus topics to compare readiness", ha="center", va="center", fontsize=8.5, color="#64748b")
        ax5.set_title("Course Syllabus Mastery & Midterm Readiness (%)", fontsize=10, fontweight="bold", color="#0f172a", pad=10)
        ax5.set_xlabel("")
        ax5.set_ylabel("Score / Mastery (%)", fontsize=8.5, color="#475569")
        ax5.tick_params(labelsize=7.5)
        sns.despine(ax=ax5)

        # Full Course & CGPA 4.00 Ledger Table
        fig2.text(
            0.035,
            0.475,
            f"All Courses & CGPA 4.00 Ledger ({len(courses)} course(s))",
            fontsize=10.5,
            fontweight="bold",
            color="#0f172a",
        )
        ax_tbl1 = fig2.add_axes([0.03, 0.06, 0.94, 0.40])
        course_rows = []
        for c in courses[:14]:
            gp = c.get("gradePoints")
            gp_str = f"{float(gp):.2f}" if gp is not None else "—"
            mid_str = f"{c.get('midtermPct')}%" if c.get("midtermPct") is not None else "—"
            syl_str = f"{int(c.get('doneTopics') or 0)}/{int(c.get('totalTopics') or 0)}"
            hrs_str = f"{float(c.get('studyMinutes') or 0) / 60.0:.1f}h"
            course_rows.append([
                safe_str(c.get("code"), 14),
                safe_str(c.get("title"), 30),
                safe_str(c.get("semester"), 14),
                f"{float(c.get('credits') or 0):.1f}",
                safe_str(c.get("gradeLetter") or ("In Prog" if not c.get("isCompleted") else "—"), 8),
                gp_str,
                mid_str,
                syl_str,
                hrs_str,
            ])
        render_table(
            ax_tbl1,
            ["Code", "Course Title", "Semester", "Cr", "Grade", "Pts/4.00", "Midterm", "Topics", "Time"],
            course_rows,
            col_widths=[0.10, 0.27, 0.13, 0.06, 0.08, 0.09, 0.09, 0.09, 0.09],
            empty_msg="No courses registered yet.",
        )

        draw_footer(fig2, 2, total_pages, student_email)
        pdf.savefig(fig2)
        plt.close(fig2)

        # =====================================================================
        # PAGE 3: COMPLETE DATA ARCHIVE (SESSIONS, SYLLABUS TOPICS & NOTES)
        # =====================================================================
        fig3 = plt.figure(figsize=(11, 8.5), dpi=150)
        fig3.patch.set_facecolor("#ffffff")

        draw_header_banner(
            fig3,
            f"Complete Study Data Archive — {student_name}",
            f"Sessions: {len(sessions)}  |  Syllabus Topics: {len(topics)}  |  Notes & Files: {len(notes)}",
            "Full Data Snapshot",
        )

        # Section A: Recent Study Sessions
        fig3.text(
            0.035,
            0.865,
            f"Study Sessions Log (Showing latest {min(10, len(sessions))} of {len(sessions)})",
            fontsize=10,
            fontweight="bold",
            color="#0f172a",
        )
        ax_sess = fig3.add_axes([0.03, 0.575, 0.94, 0.28])
        sess_rows = [
            [
                safe_str((s.get("date") or "")[:10], 12),
                safe_str(s.get("courseCode") or "GENERAL", 14),
                safe_str(s.get("source") or "timer", 10).title(),
                f"{int(s.get('durationMinutes') or 0)} min",
                safe_str(s.get("note") or "—", 52),
            ]
            for s in sessions[:10]
        ]
        render_table(
            ax_sess,
            ["Date", "Course", "Source", "Duration", "Reflection / Note"],
            sess_rows,
            col_widths=[0.13, 0.14, 0.11, 0.12, 0.50],
            empty_msg="No study sessions logged yet.",
        )

        # Section B: Syllabus Topics (Left) & Notes/Files Inventory (Right)
        fig3.text(
            0.035,
            0.53,
            f"Syllabus Topics ({done_topics}/{total_topics} Completed)",
            fontsize=10,
            fontweight="bold",
            color="#0f172a",
        )
        ax_top = fig3.add_axes([0.03, 0.06, 0.455, 0.455])
        topic_rows = [
            [
                safe_str(t.get("courseCode") or "—", 10),
                safe_str(t.get("title") or "Topic", 26),
                safe_str(t.get("status") or "todo", 8).upper(),
                safe_str(t.get("dueDate") or "—", 12),
            ]
            for t in topics[:12]
        ]
        render_table(
            ax_top,
            ["Course", "Topic", "Status", "Due Date"],
            topic_rows,
            col_widths=[0.18, 0.46, 0.16, 0.20],
            empty_msg="No syllabus topics added yet.",
        )

        text_notes_count = sum(1 for n in notes if n.get("kind") == "text")
        file_notes_count = sum(1 for n in notes if n.get("kind") == "file")
        drive_count = sum(1 for n in notes if n.get("hasDriveBackup"))
        fig3.text(
            0.515,
            0.53,
            f"Notes & Files ({text_notes_count} notes · {file_notes_count} files · {drive_count} Drive)",
            fontsize=10,
            fontweight="bold",
            color="#0f172a",
        )
        ax_notes = fig3.add_axes([0.515, 0.06, 0.455, 0.455])
        note_rows = [
            [
                safe_str(n.get("courseCode") or "GEN", 10),
                safe_str(n.get("title") or n.get("originalFilename") or "Note", 28),
                "FILE" if n.get("kind") == "file" else "NOTE",
                "Yes" if n.get("hasDriveBackup") else "Local",
            ]
            for n in notes[:12]
        ]
        render_table(
            ax_notes,
            ["Course", "Title", "Type", "Drive"],
            note_rows,
            col_widths=[0.18, 0.50, 0.14, 0.18],
            empty_msg="No notes or files stored yet.",
        )

        draw_footer(fig3, 3, total_pages, student_email)
        pdf.savefig(fig3)
        plt.close(fig3)

        # =====================================================================
        # OVERFLOW PAGES: ENSURE 100% OF STUDENT DATA IS INCLUDED IN PDF
        # =====================================================================
        for idx, (sec_title, headers, rows, widths) in enumerate(overflow_pages, start=4):
            fig_ov = plt.figure(figsize=(11, 8.5), dpi=150)
            fig_ov.patch.set_facecolor("#ffffff")
            draw_header_banner(
                fig_ov,
                f"{sec_title} — {student_name}",
                f"Complete Data Ledger · Student ID: {friend_code} · Generated: {gen_date}",
                f"CGPA {cgpa_val:.2f} / 4.00",
            )
            ax_ov = fig_ov.add_axes([0.03, 0.06, 0.94, 0.81])
            render_table(ax_ov, headers, rows, col_widths=widths)
            draw_footer(fig_ov, idx, total_pages, student_email)
            pdf.savefig(fig_ov)
            plt.close(fig_ov)


def main():
    if len(sys.argv) < 2:
        sys.stderr.write("Usage: generate_weekly_report.py <output_pdf_path>\n")
        sys.exit(2)

    output_path = sys.argv[1]
    raw = sys.stdin.read()
    payload = json.loads(raw) if raw.strip() else {}
    build_pdf(payload, output_path)


if __name__ == "__main__":
    main()
