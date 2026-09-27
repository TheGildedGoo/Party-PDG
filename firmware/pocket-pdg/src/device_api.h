#pragma once

/* Override at build time: -D POCKET_BASE_URL=\"https://your-preview.vercel.app\" */
#ifndef POCKET_BASE_URL
#define POCKET_BASE_URL "https://pdg-play.com"
#endif

#define DEVICE_API_LOGIN "/api/device/login"
#define DEVICE_API_ME "/api/device/me"
#define DEVICE_API_BANK "/api/device/bank"
#define DEVICE_API_PROGRESS "/api/device/progress"
