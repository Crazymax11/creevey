## Use your Selenium Grid (BrowserStack/SauceLabs/etc)

Sometimes you already have Selenium Grid on one of many different e2e testing services, like BrowserStack or SauceLabs , or use self-hosted one. You could use these services. If your Selenium Grid located in same network where you going to start Creevey, you will need to define `gridUrl` parameter in Creevey config. Overwise you need to start tunneling tool depends of what Grid you use:

- [browserstack-local](https://www.npmjs.com/package/browserstack-local)
- [sauce-connect-launcher](https://www.npmjs.com/package/sauce-connect-launcher)
- [open-ssh-tunnel](https://www.npmjs.com/package/open-ssh-tunnel)

To start one of these tool use `before/after` hook parameters in Creevey config.
