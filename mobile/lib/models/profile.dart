class Profile {
  final String id;
  final String label;
  final String? surname;
  final String? givenNames;
  final String? passportNumber;
  final String? nationality;
  final String? dateOfBirth;
  final String? gender;
  final String? expiryDate;
  final String? issuingCountry;
  final String? documentType;
  final String? createdAt;
  final String? updatedAt;

  Profile({
    required this.id,
    required this.label,
    this.surname,
    this.givenNames,
    this.passportNumber,
    this.nationality,
    this.dateOfBirth,
    this.gender,
    this.expiryDate,
    this.issuingCountry,
    this.documentType,
    this.createdAt,
    this.updatedAt,
  });

  factory Profile.fromJson(Map<String, dynamic> json) {
    return Profile(
      id: json['id'],
      label: json['label'],
      surname: json['surname'],
      givenNames: json['given_names'],
      passportNumber: json['passport_number'],
      nationality: json['nationality'],
      dateOfBirth: json['date_of_birth'],
      gender: json['gender'],
      expiryDate: json['expiry_date'],
      issuingCountry: json['issuing_country'],
      documentType: json['document_type'],
      createdAt: json['created_at'],
      updatedAt: json['updated_at'],
    );
  }
}
