import { QueueEvents, Worker } from "bullmq";
import imageQueue, { redis_conn } from "./queue.js";
import sharp from "sharp";
// import fs from "node:fs";
import { v4 as uuidv4 } from "uuid";
import cloudinary from "./cloudinaryConfig.js";
// import { exit } from "node:process";

// const outputDir = "./output_images";
// if (!fs.existsSync(outputDir)) {
//   fs.mkdirSync(outputDir);
// }
console.info("Worker listening for queue jobs...");

const imageWorker = new Worker(
  "imageQueue",
  async (job) => {
    const { url, requestId, productOid } = job.data;
    try {
      const response = await fetch(url);
      const data = await response.arrayBuffer();

      const inputBuffer = Buffer.from(data, "binary");
      const outputBuffer = await sharp(inputBuffer)
        .jpeg({ quality: 50 })
        .toBuffer();
      console.log(`Processed image from ${url}`);

      const outputFilename = `output-${uuidv4()}`;
      // for locally storing processed images
      // const outputPath = `${outputDir}/${outputFilename}`;

      // fs.writeFileSync(outputPath, outputBuffer);
      // console.log(`Saved image to ${outputPath}`);

      //    TODO: store the images in a bucket (S3, cloudinary)
      const uploadResult = await new Promise((resolve, reject) => {
        const uploadStream = cloudinary.uploader.upload_stream(
          {
            public_id: outputFilename,
            resource_type: "image",
          },
          (err, result) => {
            if (err) return reject(err);
            resolve(result);
          }
        );

        uploadStream.end(outputBuffer);
      });

      //   TODO: output URL changes when 3rd party storage provider used
      const outputUrl = await uploadResult.secure_url;

      //    TODO: update product document for output urls through WEBHOOK
      return { outputUrl, requestId, productOid };
    } catch (error) {
      console.error(`Error processing job ${job.id}:`, error);
      throw error;
    }
  },
  { connection: redis_conn }
);

const queueEvents = new QueueEvents("imageQueue", { connection: redis_conn });

// triggers on each job completion
queueEvents.on("completed", async ({ jobId, returnvalue }) => {
  console.log(`Job ${jobId} completed!`);

  const { requestId, productOid } = returnvalue;

  // checking redis key for images per product completed vs total
  const key = `product:${productOid}:request:${requestId}`;
  const completedCount = await redis_conn.incr(`${key}:completed`);

  const totalJobsPerProduct = await redis_conn.get(key);
  console.log(
    "completed count",
    completedCount,
    "jobs for this product",
    totalJobsPerProduct
  );

  /**
   * this block runs when "total" jobs associated with one product
   * match with the number of "completed" jobs for that that product
   * this leads to "triggering the webhook" for each batch
   */
  if (parseInt(completedCount, 10) === parseInt(totalJobsPerProduct, 10)) {
    const jobs = await imageQueue.getJobs(["completed"]);
    //  getting all completed jobs "per product"
    const productJobs = jobs.filter(
      (job) =>
        job.data.requestId === returnvalue.requestId &&
        job.data.productOid === returnvalue.productOid
    );

    //   CHECK: logic from here for grouping
    if (productJobs.length > 0) {
      // collating all the output urls per product in one place for single webhook call
      let outputUrls = productJobs.map((job) => job.returnvalue.outputUrl);

      console.log("Calling webhook...");
      const webhookURL =
        process.env.WEBHOOK_URL || "http://localhost:8000/webhook";
      try {
        const response = await fetch(webhookURL, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-api-Key": process.env.WEBHOOK_API_KEY,
          },          
          body: JSON.stringify({
            request_id: returnvalue.requestId,
            product_oid: returnvalue.productOid,
            output_urls: outputUrls,
          }),
        });

        // removing tracker key per successful batch
        await redis_conn.del(key);
        await redis_conn.del(`${key}:completed`);

        if (!response.ok) {
          throw new Error("failed to call webhook: ", response.body);
        }
        
        const responseData = await response.json();
      } catch (error) {
        console.error("Error calling webhook:", error);
      }
    }
  }
});

queueEvents.on("failed", (job) =>
  console.error(`Job ${job.id} failed! Reason: ${job.failedReason}`)
);

export default imageWorker;
