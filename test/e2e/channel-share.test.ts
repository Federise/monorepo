import { test, expect } from "@playwright/test";
import { fullSetup, urls } from "./setup";

test.describe("Channel Share Flow", () => {
  test("should create channel, send message, and generate share URL", async ({
    page,
    context,
  }) => {
    // Setup: create principal and configure apps
    await fullSetup(page);

    // Navigate to chat page
    await page.goto(`${urls.demo}/#chat`);

    // Click Connect button if not already connected
    const connectButton = page.getByRole("button", { name: "Connect" });
    if (await connectButton.isVisible({ timeout: 2000 }).catch(() => false)) {
      await connectButton.click();
    }

    // Wait for connected state
    await expect(page.getByText("Connected")).toBeVisible();

    // Check if we need to grant permissions (might already be granted)
    const grantButton = page.getByRole("button", { name: "Grant Permissions" });
    if (await grantButton.isVisible({ timeout: 2000 }).catch(() => false)) {
      await grantButton.click();

      // Handle the authorization popup
      const [authPage] = await Promise.all([
        context.waitForEvent("page"),
      ]);

      await authPage.waitForLoadState();
      await authPage.getByRole("button", { name: "Approve" }).click();
      await page.bringToFront();
    }

    // Wait for channels panel to be visible
    await expect(page.getByText("Channels")).toBeVisible({ timeout: 10000 });

    // Create a channel
    const channelName = `test-${Date.now()}`;
    await page.getByRole("textbox", { name: "New channel name" }).fill(channelName);
    await page.getByRole("button", { name: "+" }).click();

    // Verify channel was created
    await expect(page.getByRole("button", { name: `# ${channelName}` })).toBeVisible();

    // Send a message
    const testMessage = "Hello from Playwright!";
    await page.getByRole("textbox", { name: "Type a message..." }).fill(testMessage);
    await page.getByRole("button", { name: "Send" }).click();

    // Verify message appears
    await expect(page.getByText(testMessage)).toBeVisible();

    // Click Share button
    await page.getByRole("button", { name: "Share" }).click();

    // Verify share dialog appears with URL
    await expect(page.getByRole("heading", { name: "Share Channel" })).toBeVisible();

    // Get the share URL from the textbox in the dialog
    const shareDialog = page.getByRole("dialog");
    const shareUrlInput = shareDialog.getByRole("textbox");
    await expect(shareUrlInput).toBeVisible();

    // Verify URL format: http://localhost:5174/channel#<token>@<base64>
    const shareUrl = await shareUrlInput.inputValue();
    expect(shareUrl).toMatch(/http:\/\/localhost:5174\/channel#.+@.+/);

    // Close dialog
    await page.getByRole("button", { name: "Close" }).click();

    console.log(`✓ Channel "${channelName}" created with share URL: ${shareUrl}`);
  });

  test("should connect and show notes demo", async ({ page, context }) => {
    // Setup
    await fullSetup(page);

    // Navigate to notes page
    await page.goto(`${urls.demo}/#notes`);

    // Click Connect
    await page.getByRole("button", { name: "Connect" }).click();
    await expect(page.getByText("Connected")).toBeVisible();

    // Check if we need to grant permissions (might already be granted)
    const grantButton = page.getByRole("button", { name: "Grant Permissions" });
    if (await grantButton.isVisible({ timeout: 2000 }).catch(() => false)) {
      await grantButton.click();

      const [authPage] = await Promise.all([context.waitForEvent("page")]);
      await authPage.waitForLoadState();
      await authPage.getByRole("button", { name: "Approve" }).click();
      await page.bringToFront();
    }

    // Should see the notes interface (empty state)
    await expect(page.getByText("No notes yet")).toBeVisible({ timeout: 10000 });
    await expect(page.getByRole("button", { name: /new/i })).toBeVisible();
  });
});
