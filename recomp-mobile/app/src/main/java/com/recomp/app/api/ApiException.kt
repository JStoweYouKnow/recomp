package com.recomp.app.api

class ApiException(val code: Int, override val message: String) : Exception(message)
