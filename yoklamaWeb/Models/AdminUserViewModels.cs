using System.Collections.Generic;
using System.ComponentModel.DataAnnotations;
using Microsoft.AspNetCore.Mvc.Rendering;

namespace yoklamaWeb.Models
{
    public class AdminUserListItemModel
    {
        public string Id { get; set; } = null!;
        public string UserName { get; set; } = null!;
        public string Role { get; set; } = null!;
    }

    public class AdminUserCreateModel
    {
        [Required]
        [Display(Name = "Kullanıcı Adı")]
        public string UserName { get; set; } = null!;

        [Required]
        [DataType(DataType.Password)]
        [Display(Name = "Şifre")]
        public string Password { get; set; } = null!;

        [Required]
        [Display(Name = "Rol")]
        public string Role { get; set; } = null!;

        public List<SelectListItem> Roles { get; set; } = new();
    }

    public class AdminUserEditModel : IValidatableObject
    {
        public string Id { get; set; } = null!;

        [Required]
        [Display(Name = "Kullanıcı Adı")]
        public string UserName { get; set; } = null!;

        [DataType(DataType.Password)]
        [Display(Name = "Yeni Şifre")]
        public string? NewPassword { get; set; }

        [DataType(DataType.Password)]
        [Display(Name = "Yeni Şifre (Tekrar)")]
        public string? ConfirmPassword { get; set; }

        [Required]
        [Display(Name = "Rol")]
        public string Role { get; set; } = null!;

        public List<SelectListItem> Roles { get; set; } = new();

        public IEnumerable<ValidationResult> Validate(ValidationContext validationContext)
        {
            if (!string.IsNullOrWhiteSpace(NewPassword))
            {
                if (string.IsNullOrWhiteSpace(ConfirmPassword))
                {
                    yield return new ValidationResult("Yeni şifreyi tekrar girmeniz gerekiyor.", new[] { nameof(ConfirmPassword) });
                }
                else if (NewPassword != ConfirmPassword)
                {
                    yield return new ValidationResult("Yeni şifreler eşleşmiyor.", new[] { nameof(ConfirmPassword) });
                }
            }
        }
    }
}
