import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:visa_checker_mobile/services/api_service.dart';

void main() {
  final req = RequestOptions(path: '/ocr/extract');
  const url = 'http://192.168.0.106:5050';

  DioException dioError(DioExceptionType type, {int? status}) => DioException(
        requestOptions: req,
        type: type,
        response: status == null
            ? null
            : Response(requestOptions: req, statusCode: status),
      );

  test('unreachable backend names the address and the two likely causes', () {
    final e =
        BackendException.from(dioError(DioExceptionType.connectionError), url);
    expect(e, isNotNull);
    expect(e.toString(), contains(url));
    expect(e.toString(), contains('WiFi'));
    expect(e.toString(), isNot(contains('DioException')));
  });

  test('connection timeout is treated the same as refused', () {
    expect(
      BackendException.from(dioError(DioExceptionType.connectionTimeout), url),
      isNotNull,
    );
  });

  test('401 tells the user to re-pair, not to check the network', () {
    final e = BackendException.from(
        dioError(DioExceptionType.badResponse, status: 401), url);
    expect(e.toString(), contains('Re-scan'));
    expect(e.toString(), isNot(contains('WiFi')));
  });

  test('other HTTP errors are left alone so the real error surfaces', () {
    expect(
      BackendException.from(dioError(DioExceptionType.badResponse, status: 500),
          url),
      isNull,
    );
  });
}
