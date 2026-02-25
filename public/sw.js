/* Recomp service worker – push notifications */
self.addEventListener("push", (event) => {
  let payload = { title: "Recomp", body: "" };
  if (event.data) {
    try {
      payload = event.data.json();
    } catch {
      payload.body = event.data?.text() || "";
    }
  }
  const options = {
    body: payload.body || "You have an update from Recomp.",
    icon: "/icon.svg",
    badge: "/icon.svg",
    tag: payload.tag || "recomp-default",
    data: payload.data || { url: "/" },
    renotify: true,
  };
  event.waitUntil(self.registration.showNotification(payload.title || "Recomp", options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = event.notification?.data?.url || "/";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientList) => {
      if (clientList.length > 0 && clientList[0].url) {
        clientList[0].focus();
        if (clientList[0].url !== url) clientList[0].navigate(url);
      } else if (self.clients.openWindow) {
        self.clients.openWindow(url);
      }
    })
  );
});
