interface Environment {
  ASSETS: Fetcher
}

export default {
  fetch(request: Request, environment: Environment): Promise<Response> {
    return environment.ASSETS.fetch(request)
  },
}
