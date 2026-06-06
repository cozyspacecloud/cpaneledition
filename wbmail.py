import asyncio
import csv
import json
import logging
from collections import defaultdict
from urllib.parse import urlparse
from tkinter import Tk
from tkinter.filedialog import askopenfilename
from playwright.async_api import async_playwright, TimeoutError as PlaywrightTimeoutError
import traceback

# Configurations
MAX_TABS = 24
TIMEOUT = 5000  # milliseconds

logging.basicConfig(level=logging.INFO, format="%(message)s")

# Try both webmail.domain and domain/webmail
def get_webmail_urls(domain):
    return [
        f"https://webmail.{domain}"
    ]

def read_emails(file_path):
    emails = []
    if file_path.endswith(".csv"):
        with open(file_path, newline='', encoding='utf-8') as f:
            reader = csv.reader(f)
            for row in reader:
                emails.extend(row)
    elif file_path.endswith(".txt"):
        with open(file_path, "r", encoding='utf-8') as f:
            emails = [line.strip() for line in f if line.strip()]
    else:
        raise ValueError("File must be .txt or .csv")
    return emails

async def check_domain(domain, semaphore, playwright):
    urls = get_webmail_urls(domain)
    async with semaphore:
        browser = None
        try:
            browser = await playwright.chromium.launch(
                headless=True,
                args=['--no-sandbox', '--disable-dev-shm-usage', '--disable-setuid-sandbox']
            )
            context = await browser.new_context(
                ignore_https_errors=True,
                viewport={'width': 1920, 'height': 1080}
            )
            
            for url in urls:
                try:
                    page = await context.new_page()
                    # NAVIGATION (Using webmail.domain)
                    response = await page.goto(url, wait_until="domcontentloaded", timeout=TIMEOUT)
                    
                    if not response or response.status != 200:
                        await page.close()
                        continue
                        
                    # MAGIC REVISION CHECK (Primary indicator)
                    content = await page.content()
                    if "cPanel_magic_revision" in content or "Cpanel_magic_revison" in content:
                        await page.close()
                        return domain, url
                    
                    await page.close()
                    
                except PlaywrightTimeoutError:
                    await page.close() if 'page' in locals() else None
                except Exception as e:
                    await page.close() if 'page' in locals() else None
                    
        except Exception as e:
            logging.debug(f"Error with domain {domain}: {e}")
        finally:
            if browser:
                await context.close() if 'context' in locals() else None
                await browser.close()
    
    return domain, None

async def process_email(email, semaphore, playwright, webmail_emails_all, non_webmail_emails_all):
    domain = email.split("@")[-1].strip()
    result = await check_domain(domain, semaphore, playwright)
    
    if result[1]:
        webmail_emails_all[email] = result[1]
        print(f"{email} ✅ (webmail)")
        # IMMEDIATE SAVE in requested format (email : url)
        with open("webmail_emails_partial.json", "w") as f:
            json.dump(webmail_emails_all, f, indent=2)
        with open("webmail_emails.txt", "a") as f:
            f.write(f"{email} : {result[1]}\n")
    else:
        non_webmail_emails_all[email] = "Not a valid webmail"
        print(f"{email} ❌ (non webmail)")
        with open("non_webmail_emails_partial.json", "w") as f:
            json.dump(non_webmail_emails_all, f, indent=2)

async def main(emails):
    semaphore = asyncio.Semaphore(min(MAX_TABS, 5))  # Reduce concurrency for stability
    
    webmail_emails_all = {}
    non_webmail_emails_all = {}
    
    async with async_playwright() as playwright:
        # Process emails in batches to avoid memory issues
        batch_size = 1000
        for i in range(0, len(emails), batch_size):
            batch = emails[i:i + batch_size]
            print(f"\n📋 Processing batch {i//batch_size + 1}/{(len(emails) + batch_size - 1)//batch_size} ({len(batch)} emails)")
            
            # Process each email in the batch
            for email in batch:
                await process_email(email, semaphore, playwright, webmail_emails_all, non_webmail_emails_all)
            
            # Force garbage collection and small pause between batches
            await asyncio.sleep(0.1)
        
        # FINAL SAVE after all batches are done
        print("\n💾 Saving final results...")
        with open("webmail_emails_final.json", "w") as f:
            json.dump(webmail_emails_all, f, indent=2)
        with open("non_webmail_emails_final.json", "w") as f:
            json.dump(non_webmail_emails_all, f, indent=2)
        
        # Save a text version as well for easy reading (email : url)
        with open("webmail_emails.txt", "w") as f:
            for email, url in webmail_emails_all.items():
                f.write(f"{email} : {url}\n")

if __name__ == "__main__":
    print("📂 Please select a .txt or .csv file containing emails...")
    root = Tk()
    root.withdraw()
    file_path = askopenfilename(filetypes=[("Email files", "*.txt *.csv")])
    root.destroy()
    
    if not file_path:
        print("❌ No file selected. Exiting.")
        exit(1)
    
    try:
        emails = read_emails(file_path)
    except Exception as e:
        print(f"\n❌ Error: {e}")
        exit(1)
    
    print(f"\n📨 Loaded {len(emails):,} emails... Processing...\n")

    try:
        asyncio.run(main(emails))
        
        print(f"\n✅ Finished processing {len(emails)} emails.")
        
    except Exception as e:
        print(f"\n❌ Fatal error during processing: {e}")
        traceback.print_exc()
        exit(1)
