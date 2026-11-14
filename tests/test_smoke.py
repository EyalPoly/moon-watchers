def test_engine_and_api_import() -> None:
    import api
    import engine

    assert api and engine
