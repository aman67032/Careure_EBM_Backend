# CareSure Backend API

Express.js backend for CareSure medication management system.

## Setup

1. Install dependencies:
```bash
npm install
```

2. Create `.env` file with database connection:
```env
DATABASE_URL=your_neon_database_url
JWT_SECRET=your_secret_key
PORT=5000
FRONTEND_URL=http://localhost:3000
```

3. Start server:
```bash
npm run dev
```

The database schema will be initialized automatically on first run.

## API Documentation

See main README.md for complete API endpoint documentation.

## File Structure

- `config/` - Database configuration
- `middleware/` - Authentication and validation
- `routes/` - API route handlers
- `uploads/` - Uploaded files directory
- `server.js` - Main server file

