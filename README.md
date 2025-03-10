# Async Image Processing API w/ Workers

This API allows users to upload CSV files with image URLs, processes the images, and generates an output CSV file with the processed URLs.

## Features

- Upload CSV with image URLs
- Image processing (resizing, etc.)
- Webhook notification on completion
- Generate output CSV with processed URLs

## Technology Stack

- Node.js, Express.js - API Server
- BullMQ, Redis - Job Queue
- Cloudinary, MongoDB - Asset storage & CSV Data

# Setup Instructions

Either use the postman collection for a deployed version

or run locally with own credentials 👇

1. Clone the Repository:

```sh
git clone https://github.com/surajj2024/csvImgProcessing.git
```

2. Install Dependencies:

```sh
npm install
```
3. Start Redis (Required for BullMQ):

   docker run -itd -p 6379:6379 redis


3. Environment Variables:

   Create a .env file from the `.env.example` file.

5. Start the Server:

```sh
npm start
```

5. Start the Worker:

```sh
npm run start:worker
```

## LLD

[check here](./LLD.md)

## Postman Collection

Import the collection file from the `postman` directory for testing.

## Usage

Refer the postman documentation for usage.