const constructHtml = (content) => {
    return `<html lang="en" dir="ltr">
              <head>
                  <meta http-equiv="Content-Type" content="text/html; charset=UTF-8">
                  <meta name="viewport" content="width=device-width, initial-scale=1, shrink-to-fit=no">
                  <title>Test Runner</title>
                  <link href="/assets/styles/main.css" rel="stylesheet">
                  <link rel="stylesheet" type="text/css" href="/assets/styles/style.css">
              </head>
              <body class="dark-mode">
                  <div id="root">
                    <header class="header-dfryKG">
                        <a aria-current="page" class="logo-DC8O1O active" href="/">
                            <img src="/assets/images/e2e-tests-logo.png" class="img-ggCynO" width="100px" height="200" alt="">
                        </a>
                    </header>
                    <main>
                        <div>
                          <section>
                              ${content}
                          </section>
                        </div>
                    </main>
                    <aside class="aside-tRszgh">
                        <nav>
                          <ul class="menu-zMsDO4">
                              <li><a aria-current="page" class="active-hKGR_B" title="TTK-TESTS" href="/"> < Back </a></li>
                          </ul>
                        </nav>
                    </aside>
                  </div>
              </body>
            </html>`
}

module.exports = {
    constructHtml
}
