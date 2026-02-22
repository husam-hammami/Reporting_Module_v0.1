# Reporting Module v0.1

A configurable, generic reporting system with drag-and-drop report builder, live monitoring, and historical data visualization.

## Features

- **Report Builder** — Design reports with drag-and-drop widgets
- **Reporting** — View reports with live & historical data
- **Engineering** — Tags, Tag Groups, Formulas, Mappings, Email, Shifts, Users, System
- **Demo Mode** — Built-in software emulator for testing without real PLC hardware

## Tech Stack

- **Frontend:** React + Vite (port 5174)
- **Backend:** Flask + Flask-SocketIO (port 5000)
- **Database:** PostgreSQL 17
- **Real-time:** WebSocket for live tag values

## Documentation

Full system documentation is available in [`docs/00-INDEX.md`](docs/00-INDEX.md) — covering the complete workflow from PLC connection to report viewing.

- **For Engineers & Operators:** PLC setup, tag engineering, grouping, mapping, formulas, emulator, report builder, live monitoring, historical reports, shifts
- **For Developers:** Architecture, deployment, authentication, templates, API reference, database schema, troubleshooting

## Getting Started

See [QUICKSTART.md](QUICKSTART.md) for setup instructions.