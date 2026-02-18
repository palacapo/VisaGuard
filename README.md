# ExpireGuard - Production-Ready Electron Application

A cross-platform desktop application to track expiration dates of important documents (visas, passports, residence permits) with system notifications and background execution.

## Features

✅ **Background Mode** - App continues running when window is closed  
✅ **System Tray** - Quick access and manual checks from tray menu  
✅ **Daily Scheduler** - Automatic expiration checks every 24 hours  
✅ **Smart Notifications** - Only one notification per status per day  
✅ **Secure** - contextIsolation enabled, no nodeIntegration  
✅ **Responsive UI** - Modern, clean interface  
✅ **localStorage** - Persistent document storage  

## Getting Started

### Prerequisites
- Node.js (v14+)
- npm

### Installation

```bash
cd ExpireGuard
npm install
```

### Running

```bash
npm start
```

The app will open with DevTools for development. Close DevTools with F12 if needed.

## Usage

### Adding Documents
1. Select document type (Visa, Passport, Residence Permit)
2. Choose expiration date
3. Click "Save Document"
4. Document appears in the list with remaining days

### Viewing Documents
- **Green**: More than 7 days remaining
- **Orange**: 7 days or less remaining  
- **Red**: Document has expired

### Tray Features
Right-click the system tray icon for:
- **Open ExpireGuard** - Restore the window
- **Check Expirations Now** - Manual check for all documents
- **Exit** - Close the application

### Notifications
You'll receive notifications at:
- **30 days before** expiration
- **7 days before** expiration
- **On expiration date**

Each notification type is sent only once per document per day to prevent spam.

## Architecture

```
ExpireGuard/
├── main.js           # Electron main process (window, tray, scheduler)
├── preload.js        # Secure IPC bridge
├── package.json      # Dependencies
└── src/
    ├── index.html    # UI
    └── renderer.js   # Logic (documents, notifications, storage)
```

## Security

- **Context Isolation**: Enabled
- **Node Integration**: Disabled  
- **Sandbox**: Enabled
- **Preload Script**: Used for IPC bridge
- **No eval()**: Safe code patterns

## Storage

Documents are stored in localStorage as:

```javascript
{
  id: 1707859200000,
  type: "Visa",
  expiryDate: "2026-12-31",
  notified30: false,
  notified7: false,
  notifiedExpired: false
}
```

Last check date is also stored to prevent duplicate daily checks.

## Production Notes

- App automatically hides to tray when closed (doesn't quit)
- Only quits when "Exit" is selected from menu or tray
- Scheduler runs once every 24 hours automatically
- Manual checks can be triggered anytime from tray
- Notifications include proper titles for different warning levels
- All flags properly tracked to prevent duplicate notifications

## Development

To modify the app:

1. **main.js** - Window, tray, scheduler, and IPC handlers
2. **renderer.js** - UI logic, document management, checks
3. **preload.js** - API bridge between processes
4. **index.html** - UI markup and styling

## License

MIT

## Support

For issues or questions, check:
- Browser console (F12) for errors
- DevTools for debugging
- localStorage for data verification
