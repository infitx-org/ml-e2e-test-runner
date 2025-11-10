const now = () => {
  return new Date().toLocaleDateString()
}

const totalAssertions = (testCases) => {
  return testCases.reduce((total, curTestCase) => {
    const assertionsInRequest = curTestCase.requests.reduce((assertionCountRequest, curRequest) => {
      return assertionCountRequest + ((curRequest.request.tests && curRequest.request.tests.assertions) ? curRequest.request.tests.assertions.length : 0)
    }, 0)
    return total + assertionsInRequest
  }, 0)
}

const totalPassedAssertions = (testCases) => {
  return testCases.reduce((total, curTestCase) => {
    const passedAssertionsInRequest = curTestCase.requests.reduce((passedAssertionCountRequest, curRequest) => {
      return passedAssertionCountRequest + ((curRequest.request.tests && curRequest.request.tests.passedAssertionsCount) ? curRequest.request.tests.passedAssertionsCount : 0)
    }, 0)
    return total + passedAssertionsInRequest
  }, 0)
}

const totalFailedAssertions = (testCases) => {
  return totalAssertions(testCases) - totalPassedAssertions(testCases)
}

const totalTestCases = (testCases) => {
  return testCases.length
}

const failedTestCases = (testCases) => {
  return testCases.reduce((total, curTestCase) => {
    const assertionsInRequest = curTestCase.requests.reduce((assertionCountRequest, curRequest) => {
      return assertionCountRequest + ((curRequest.request.tests && curRequest.request.tests.assertions) ? curRequest.request.tests.assertions.length : 0)
    }, 0)
    const passedAssertionsInRequest = curTestCase.requests.reduce((passedAssertionCountRequest, curRequest) => {
      return passedAssertionCountRequest + ((curRequest.request.tests && curRequest.request.tests.passedAssertionsCount) ? curRequest.request.tests.passedAssertionsCount : 0)
    }, 0)
    return total + (passedAssertionsInRequest === assertionsInRequest ? 0 : 1)
  }, 0)
}

const totalRequests = (testCases) => {
  return testCases.reduce((total, curTestCase) => {
    return total + curTestCase.requests.length
  }, 0)
}

const failedRequests = (testCases) => {
  return testCases.reduce((total, curTestCase) => {
    const faileRequestsCount = curTestCase.requests.reduce((failedRequestCountTemp, curRequest) => {
      return failedRequestCountTemp + ((curRequest.request.tests && curRequest.request.tests.assertions) ? (curRequest.request.tests.assertions.length === curRequest.request.tests.passedAssertionsCount ? 0 : 1) : 0)
    }, 0)
    return total + faileRequestsCount
  }, 0)
}

const testPassPercentage = (tests) => {
  if (tests && tests.assertions) {
    return Math.round(tests.passedAssertionsCount * 100 / tests.assertions.length)
  } else {
    return 100
  }
}

const ifAllTestsPassedInRequest = (request) => {
  if (request.tests && request.tests.assertions) {
    return request.tests.passedAssertionsCount === request.tests.assertions.length
  } else {
    return true
  }
}

const ifFailedTestCase = (testCase) => {
  const failedRequest = testCase.requests.find((item) => {
    if (item.request.tests && item.request.tests.assertions) {
      return item.request.tests.passedAssertionsCount !== item.request.tests.assertions.length
    } else {
      return false
    }
  })
  if (failedRequest) {
    return true
  } else {
    return false
  }
}

const ifSkippedRequest = (status) => {
  if (status && status === 'SKIPPED') {
    return true
  } else {
    return false
  }
}

const jsonStringify = (inputObject) => {
  return JSON.stringify(inputObject, null, 2)
}

const isAssertionPassed = (status) => {
  return status === 'SUCCESS'
}

const isAssertionSkipped = (status) => {
  return status === 'SKIPPED'
}

module.exports = {
  now,
  totalAssertions,
  totalPassedAssertions,
  totalFailedAssertions,
  totalTestCases,
  failedTestCases,
  totalRequests,
  failedRequests,
  testPassPercentage,
  ifAllTestsPassedInRequest,
  ifFailedTestCase,
  jsonStringify,
  isAssertionPassed,
  isAssertionSkipped,
  ifSkippedRequest
}
