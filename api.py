import asyncio
import json
import os
from typing import List
from fastapi import FastAPI, UploadFile, File, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import webmail  # Import the original script

# Override webmail timeout for the dashboard — some servers need more than 5s
webmail.TIMEOUT = 15000

app = FastAPI()

# Enable CORS for Next.js
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Global state to track progress
processing_stats = {
    "total": 0,
    "processed": 0,
    "found": 0,
    "failed": 0,
    "status": "idle",
    "results": []
}

class Stats(BaseModel):
    total: int
    processed: int
    found: int
    failed: int
    status: str
    results: List[dict]

@app.get("/stats", response_model=Stats)
async def get_stats():
    return processing_stats

async def run_processing(emails: List[str]):
    global processing_stats
    processing_stats["total"] = len(emails)
    processing_stats["processed"] = 0
    processing_stats["found"] = 0
    processing_stats["failed"] = 0
    processing_stats["status"] = "processing"
    processing_stats["results"] = []
    
    semaphore = asyncio.Semaphore(min(webmail.MAX_TABS, 5))
    webmail_emails_all = {}
    non_webmail_emails_all = {}
    
    from playwright.async_api import async_playwright
    
    async with async_playwright() as playwright:
        for email in emails:
            # We reuse the process_email logic but capture results for the UI
            domain = email.split("@")[-1].strip()
            result = await webmail.check_domain(domain, semaphore, playwright)
            
            processing_stats["processed"] += 1
            if result[1]:
                processing_stats["found"] += 1
                processing_stats["results"].append({"email": email, "url": result[1], "status": "✅"})
                webmail_emails_all[email] = result[1]
            else:
                processing_stats["failed"] += 1
                processing_stats["results"].append({"email": email, "url": None, "status": "❌"})
                non_webmail_emails_all[email] = "Not a valid webmail"
                
    processing_stats["status"] = "completed"
    
    # Also save to the original files as expected by the user
    with open("webmail_emails_final.json", "w") as f:
        json.dump(webmail_emails_all, f, indent=2)
    with open("webmail_emails.txt", "w") as f:
        for email, url in webmail_emails_all.items():
            f.write(f"{email} : {url}\n")

@app.post("/start")
async def start_processing(background_tasks: BackgroundTasks, file: UploadFile = File(...)):
    global processing_stats
    if processing_stats["status"] == "processing":
        return {"message": "Already processing", "count": processing_stats["total"]}
    content = await file.read()
    emails = [line.decode("utf-8").strip() for line in content.splitlines() if line.strip()]
    
    background_tasks.add_task(run_processing, emails)
    return {"message": "Processing started", "count": len(emails)}

@app.post("/reset")
async def reset_stats():
    global processing_stats
    processing_stats = {
        "total": 0,
        "processed": 0,
        "found": 0,
        "failed": 0,
        "status": "idle",
        "results": []
    }
    return {"message": "Stats reset"}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
